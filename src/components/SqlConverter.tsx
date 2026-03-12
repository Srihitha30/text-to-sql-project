import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check, Loader2, Sparkles, Zap, Code2, Upload, Database } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import TableUpload, { TableSchema } from "./TableUpload";

type QueryMode = "basic" | "advanced";
type SourceMode = "general" | "table";

const basicExamples = [
  "Show all customers from New York",
  "Get total sales per product in 2024",
  "Find top 5 employees by salary",
  "Count orders placed last month",
  "List products with price above 100",
];

const advancedExamples = [
  "Create a trigger to log changes to orders table",
  "Write a cursor to process employees one by one",
  "Nested query: Find departments with above-average salary",
  "Create a stored procedure for monthly sales report",
  "Write a CTE to calculate running total of sales",
];

export default function SqlConverter() {
  const [input, setInput] = useState("");
  const [sqlOutput, setSqlOutput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<QueryMode>("basic");
  const [sourceMode, setSourceMode] = useState<SourceMode>("general");
  const [tableSchemas, setTableSchemas] = useState<TableSchema[]>([]);
  const [selectedSchemaId, setSelectedSchemaId] = useState<string | null>(null);

  const selectedSchema = tableSchemas.find((s) => s.id === selectedSchemaId) || null;

  const examples = mode === "basic" ? basicExamples : advancedExamples;

  const getTableExamples = () => {
    if (tableSchemas.length === 0) return [];
    
    // If multiple tables, show join examples
    if (tableSchemas.length > 1) {
      const table1 = tableSchemas[0];
      const table2 = tableSchemas[1];
      return [
        `Show all records from ${table1.tableName}`,
        `Join ${table1.tableName} and ${table2.tableName}`,
        `Count records in ${table1.tableName} grouped by ${table1.columns[0]?.name || "column"}`,
        `Show data from both ${table1.tableName} and ${table2.tableName} where they match`,
      ];
    }
    
    // Single table examples
    if (!selectedSchema) return [];
    const cols = selectedSchema.columns.slice(0, 3).map((c) => c.name);
    return [
      `Show all records from ${selectedSchema.tableName}`,
      cols[0] ? `Count total ${cols[0]}` : "Count all rows",
      cols[1] ? `Find records where ${cols[1]} is highest` : "Find top records",
      cols.length >= 2 ? `Group by ${cols[0]} and show average ${cols[1]}` : "Show summary statistics",
    ];
  };

  const handleGenerate = async () => {
    if (!input.trim()) {
      toast({
        title: "Please enter a query",
        description: "Type an English description of what you want to retrieve.",
        variant: "destructive",
      });
      return;
    }

    if (sourceMode === "table" && tableSchemas.length === 0) {
      toast({
        title: "No tables uploaded",
        description: "Please upload at least one table first.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setSqlOutput("");

    try {
      const response = await supabase.functions.invoke("text-to-sql", {
        body: { 
          query: input.trim(), 
          mode,
          tableSchemas: sourceMode === "table" ? tableSchemas.map(s => ({
            tableName: s.tableName,
            columns: s.columns.map(c => ({ name: c.name, type: c.type }))
          })) : undefined,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to generate SQL");
      }

      if (response.data?.sql) {
        setSqlOutput(response.data.sql);
        
        // Check if it's an error message from schema validation
        if (response.data.sql.startsWith("ERROR:") || response.data.sql.startsWith("-- Error:")) {
          toast({
            title: "Cannot generate query",
            description: "The requested data is not available in the uploaded table(s).",
            variant: "destructive",
          });
        } else {
          toast({
            title: "SQL Generated",
            description: "Your query has been converted successfully!",
          });
        }
      } else {
        throw new Error("No SQL returned");
      }
    } catch (error) {
      console.error("Error generating SQL:", error);
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!sqlOutput) return;
    
    try {
      await navigator.clipboard.writeText(sqlOutput);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "SQL query copied to clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Copy failed",
        description: "Please select and copy manually.",
        variant: "destructive",
      });
    }
  };

  const handleExampleClick = (example: string) => {
    setInput(example);
  };

  const displayExamples = sourceMode === "table" && tableSchemas.length > 0 ? getTableExamples() : examples;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-5 animate-slide-up">
      {/* Source Mode Toggle */}
      <div className="flex justify-center gap-2 p-1.5 bg-card/60 backdrop-blur-sm rounded-2xl shadow-lg border border-border/30 w-fit mx-auto">
        <button
          onClick={() => setSourceMode("general")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 ${
            sourceMode === "general"
              ? "bg-secondary text-secondary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          <Database className="h-4 w-4" />
          General SQL
        </button>
        <button
          onClick={() => setSourceMode("table")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 ${
            sourceMode === "table"
              ? "bg-secondary text-secondary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          <Upload className="h-4 w-4" />
          From Uploaded Table
        </button>
      </div>

      {/* Table Upload Section */}
      {sourceMode === "table" && (
        <div className="animate-fade-in">
          <TableUpload 
            onSchemasChange={setTableSchemas}
            schemas={tableSchemas}
            selectedSchemaId={selectedSchemaId}
            onSelectSchema={setSelectedSchemaId}
          />
        </div>
      )}

      {/* Mode Toggle */}
      <div className="flex justify-center gap-2 p-1.5 bg-card/60 backdrop-blur-sm rounded-2xl shadow-lg border border-border/30 w-fit mx-auto">
        <button
          onClick={() => setMode("basic")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 ${
            mode === "basic"
              ? "gradient-button text-primary-foreground shadow-button"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          <Zap className="h-4 w-4" />
          Basic
        </button>
        <button
          onClick={() => setMode("advanced")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 ${
            mode === "advanced"
              ? "gradient-button text-primary-foreground shadow-button"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          <Code2 className="h-4 w-4" />
          Advanced
        </button>
      </div>

      {/* Mode Description */}
      <p className="text-center text-sm text-muted-foreground">
        {mode === "basic" 
          ? "Simple SELECT, WHERE, JOIN, GROUP BY queries" 
          : "Triggers, Cursors, Stored Procedures, CTEs, Nested Queries"}
      </p>

      {/* Input Section */}
      <div className="gradient-card rounded-3xl p-6 shadow-card border border-border/40">
        <label className="block text-sm font-semibold text-foreground/80 mb-3">
          {sourceMode === "table" && tableSchemas.length > 0
            ? tableSchemas.length > 1 
              ? `Ask a question about your ${tableSchemas.length} tables (joins supported)`
              : `Ask a question about "${tableSchemas[0].tableName}"`
            : "Describe what you want in plain English"}
        </label>
        <Textarea
          placeholder={
            sourceMode === "table" && tableSchemas.length > 0
              ? tableSchemas.length > 1
                ? `Example: Join ${tableSchemas[0].tableName} and ${tableSchemas[1].tableName} on matching columns`
                : `Example: Show all records where ${tableSchemas[0].columns[0]?.name || "column"} is greater than 100`
              : mode === "basic" 
                ? "Example: Show total sales per product in 2024" 
                : "Example: Create a trigger to log all updates to the users table"
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="min-h-[130px] text-base font-display bg-background/60 border-border/40 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 resize-none rounded-2xl transition-all duration-200"
        />
        
        {/* Example Chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          {displayExamples.map((example, index) => (
            <button
              key={index}
              onClick={() => handleExampleClick(example)}
              className="px-3.5 py-1.5 text-xs font-medium rounded-full bg-muted/80 hover:bg-primary/10 text-muted-foreground hover:text-foreground transition-all duration-200 border border-border/40 hover:border-primary/30 hover:shadow-sm"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {/* Generate Button */}
      <div className="flex justify-center">
        <Button
          onClick={handleGenerate}
          disabled={isLoading || !input.trim() || (sourceMode === "table" && tableSchemas.length === 0)}
          size="lg"
          className="gradient-button shadow-button text-primary-foreground font-bold text-lg px-12 py-7 rounded-2xl transition-all duration-300 hover:scale-105 hover:shadow-glow disabled:opacity-50 disabled:hover:scale-100"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-5 w-5" />
              Generate SQL
            </>
          )}
        </Button>
      </div>

      {/* Output Section */}
      <div className="gradient-card rounded-3xl p-6 shadow-card border border-border/40">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-semibold text-foreground/80">
            Generated SQL Query
          </label>
          {sqlOutput && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="text-muted-foreground hover:text-foreground rounded-xl"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-1.5 text-green-500" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1.5" />
                  Copy
                </>
              )}
            </Button>
          )}
        </div>
        <div className="relative">
          <pre className="min-h-[140px] p-5 bg-foreground/[0.03] rounded-2xl overflow-x-auto font-mono text-sm leading-relaxed border border-border/30">
            {sqlOutput || (
              <span className="text-muted-foreground/50 italic">
                Your SQL query will appear here...
              </span>
            )}
          </pre>
        </div>
      </div>
    </div>
  );
}
