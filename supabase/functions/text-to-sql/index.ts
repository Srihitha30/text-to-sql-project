import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TableColumn {
  name: string;
  type: string;
}

interface TableSchema {
  tableName: string;
  columns: TableColumn[];
}

const basicSystemPrompt = `You are an expert SQL query generator. Convert natural language descriptions into valid, optimized SQL queries.

RULES:
1. Output ONLY the SQL query - no explanations, no comments, no markdown code blocks
2. Use the simplest query structure that achieves the goal
3. DO NOT use JOINs for simple single-table queries
4. Only use JOINs when data from multiple tables is truly required
5. Infer reasonable table and column names based on the context
6. Use standard SQL syntax compatible with most databases
7. Apply appropriate clauses: SELECT, FROM, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT
8. Use aggregate functions (COUNT, SUM, AVG, MIN, MAX) when implied by the request
9. Handle common patterns:
   - "top N" → ORDER BY ... DESC LIMIT N
   - "total/sum" → SUM()
   - "average" → AVG()
   - "count/number of" → COUNT()
   - "per/by/grouped" → GROUP BY
   - Date ranges → WHERE date_column BETWEEN or >=, <=
10. Always use clear, readable formatting with proper indentation

Examples:
- "show all customers" → SELECT * FROM customers;
- "count orders last month" → SELECT COUNT(*) FROM orders WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') AND created_at < DATE_TRUNC('month', CURRENT_DATE);
- "top 5 products by sales" → SELECT product_name, SUM(quantity) as total_sales FROM order_items GROUP BY product_name ORDER BY total_sales DESC LIMIT 5;`;

const advancedSystemPrompt = `You are an expert SQL developer. Generate advanced SQL code including triggers, cursors, stored procedures, CTEs, nested queries, and complex database operations.

RULES:
1. Output ONLY the SQL code - no explanations, no comments, no markdown code blocks
2. Support all advanced SQL features:
   - Triggers (BEFORE/AFTER INSERT/UPDATE/DELETE)
   - Cursors for row-by-row processing
   - Stored Procedures and Functions
   - Common Table Expressions (CTEs) with WITH clause
   - Nested/Subqueries (correlated and non-correlated)
   - Window Functions (ROW_NUMBER, RANK, DENSE_RANK, LAG, LEAD, etc.)
   - CASE statements and conditional logic
   - Transactions with COMMIT/ROLLBACK
   - Dynamic SQL
   - Error handling with TRY/CATCH or EXCEPTION blocks
3. Use PostgreSQL syntax by default (widely compatible)
4. Include proper formatting and indentation for readability
5. Infer reasonable table and column names based on context
6. For triggers, create the trigger function first, then the trigger itself

Examples:
- "Create a trigger to log changes" → Creates audit trigger with function
- "Cursor to process employees" → DECLARE cursor, OPEN, FETCH, CLOSE pattern
- "Nested query for above average" → SELECT with subquery in WHERE
- "CTE for running total" → WITH clause with window function`;

const buildSchemaAwarePrompt = (schemas: TableSchema[], mode: string): string => {
  const isSingleTable = schemas.length === 1;
  
  const tablesDescription = schemas
    .map((schema) => {
      const columnsDescription = schema.columns
        .map((col) => `    - ${col.name} (${col.type})`)
        .join("\n");
      return `TABLE: ${schema.tableName}\nCOLUMNS:\n${columnsDescription}`;
    })
    .join("\n\n");

  const allTableNames = schemas.map((s) => s.tableName).join(", ");
  const allColumnNames = schemas
    .flatMap((s) => s.columns.map((c) => `${s.tableName}.${c.name}`))
    .join(", ");

  const basePrompt = mode === "advanced" ? advancedSystemPrompt : basicSystemPrompt;

  const joinGuidance = isSingleTable
    ? `You can ONLY use the table "${schemas[0].tableName}" - no other tables.`
    : `You can use any of these tables: ${allTableNames}
When the user asks for data that spans multiple tables, use appropriate JOINs.
Infer JOIN conditions based on column names (e.g., employee_id in one table likely joins with id or employee_id in another).
Common JOIN patterns:
- Tables with matching column names (id, *_id) can be joined
- Use explicit table aliases for clarity (e.g., e.employee_id, d.department_id)
- Prefer INNER JOIN unless the question implies including all records from one table`;

  return `${basePrompt}

CRITICAL - TABLE SCHEMA CONSTRAINT:
You are generating SQL for ${isSingleTable ? "a specific uploaded table" : "multiple uploaded tables"}. You MUST follow these rules:

${tablesDescription}

STRICT RULES FOR SCHEMA-AWARE GENERATION:
1. ${joinGuidance}
2. You can ONLY use the columns listed above - no other columns
3. If the user asks about data that cannot be derived from these columns, respond with EXACTLY:
   ERROR: The requested data is not available in the uploaded table(s). Available columns are: ${allColumnNames}
4. Match column names exactly as provided (case-sensitive)
5. Use appropriate type-aware operations based on column types
6. For aggregate queries, only aggregate columns that make sense for their type
7. Never hallucinate or invent column names or table names
${!isSingleTable ? `8. When joining tables, always qualify column names with table name or alias to avoid ambiguity` : ""}

Examples with this schema:
- If user asks for a column that doesn't exist → Return the ERROR message
- If user asks for valid columns → Generate proper SQL using only available tables and columns`;
};

const validateSqlAgainstSchema = (sql: string, schemas: TableSchema[]): { valid: boolean; error?: string } => {
  const sqlLower = sql.toLowerCase();
  const allColumns = schemas.flatMap((s) => s.columns.map((c) => c.name.toLowerCase()));
  const allTableNames = schemas.map((s) => s.tableName.toLowerCase());

  // If it's an error response, pass it through
  if (sql.startsWith("ERROR:")) {
    return { valid: true };
  }

  // Check if we're using at least one of the correct tables
  const usesValidTable = allTableNames.some((tableName) => sqlLower.includes(tableName));
  if (!usesValidTable) {
    return {
      valid: false,
      error: `The generated SQL uses unknown tables. Expected one of: ${schemas.map((s) => s.tableName).join(", ")}`,
    };
  }

  return { valid: true };
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, mode = "basic", tableSchema, tableSchemas } = await req.json();

    if (!query || typeof query !== "string") {
      console.error("Invalid query input:", query);
      return new Response(
        JSON.stringify({ error: "Please provide a valid query description" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Support both single tableSchema (backwards compat) and multiple tableSchemas
    const schemas: TableSchema[] = tableSchemas || (tableSchema ? [tableSchema] : []);

    console.log("Processing query:", query, "Mode:", mode, "Tables:", schemas.map((s: TableSchema) => s.tableName).join(", ") || "none");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      throw new Error("API key not configured");
    }

    // Build the appropriate system prompt
    let systemPrompt: string;
    if (schemas.length > 0) {
      systemPrompt = buildSchemaAwarePrompt(schemas, mode);
      console.log("Using schema-aware prompt for tables:", schemas.map((s: TableSchema) => s.tableName).join(", "));
    } else {
      systemPrompt = mode === "advanced" ? advancedSystemPrompt : basicSystemPrompt;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: query },
        ],
        temperature: 0.1,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Service temporarily unavailable. Please try again later." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error("Failed to generate SQL query");
    }

    const data = await response.json();
    let sql = data.choices?.[0]?.message?.content?.trim() || "";

    // Clean up the response - remove any markdown code blocks if present
    sql = sql.replace(/```sql\n?/gi, "").replace(/```\n?/g, "").trim();

    // Validate against schema if provided
    if (schemas.length > 0) {
      const validation = validateSqlAgainstSchema(sql, schemas);
      if (!validation.valid) {
        const allColumns = schemas.flatMap((s: TableSchema) => s.columns.map((c: TableColumn) => `${s.tableName}.${c.name}`));
        console.error("Schema validation failed:", validation.error);
        return new Response(
          JSON.stringify({ 
            sql: `-- Error: ${validation.error}\n-- Please rephrase your question using available columns: ${allColumns.join(", ")}`,
            error: validation.error 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log("Generated SQL:", sql);

    return new Response(
      JSON.stringify({ sql }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in text-to-sql function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "An error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
