import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const systemPrompt = `You are a table extraction expert. Analyze the uploaded image and extract any tabular data you find.

RULES:
1. Extract the table structure including headers and data rows
2. IMPORTANT - Table Name Extraction:
   - Look for any title, heading, caption, or label above/near the table in the image
   - If you find a table name/title (e.g., "Employees", "Sales Data", "Customer List"), use it as tableName
   - Convert the table name to a valid SQL table name (lowercase, underscores instead of spaces)
   - Only if NO table name is visible in the image, use "extracted_table" as default
3. Output ONLY valid JSON in this exact format:
{
  "success": true,
  "tableName": "actual_table_name_from_image",
  "headers": ["column1", "column2", ...],
  "rows": [
    ["value1", "value2", ...],
    ["value1", "value2", ...]
  ],
  "columnTypes": ["TEXT", "INTEGER", ...]
}

4. If no table is found in the image, return:
{
  "success": false,
  "error": "No table found in the image"
}

5. Infer column types based on the data:
   - Numbers without decimals → INTEGER
   - Numbers with decimals → DECIMAL
   - Date-like values → DATE
   - true/false/yes/no → BOOLEAN
   - Everything else → TEXT

6. Clean up header names to be valid SQL column names (lowercase, underscores instead of spaces)
7. Handle merged cells, partial tables, or unclear data as best as possible
8. If the image is blurry or unreadable, return an error message`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, fileName } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Prepare fallback table name from filename
    const fallbackTableName = fileName 
      ? fileName.replace(/\.[^/.]+$/, "").toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_")
      : "extracted_table";

    console.log("Processing image for table extraction...");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("API key not configured");
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
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract the table data from this image. Return only valid JSON.",
              },
              {
                type: "image_url",
                image_url: {
                  url: imageBase64,
                },
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 4000,
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
      
      throw new Error("Failed to process image");
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content?.trim() || "";

    // Clean up markdown if present
    content = content.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();

    console.log("Extracted content:", content);

    try {
      const tableData = JSON.parse(content);
      
      // Use fallback table name if AI returned default or empty
      if (tableData.success && (!tableData.tableName || tableData.tableName === "extracted_table")) {
        tableData.tableName = fallbackTableName;
      }
      
      return new Response(
        JSON.stringify(tableData),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch {
      console.error("Failed to parse JSON response:", content);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to extract table structure from image" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("Error in extract-table-from-image:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "An error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
