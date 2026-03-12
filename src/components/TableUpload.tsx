import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, X, AlertCircle, Image, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";

export interface TableColumn {
  name: string;
  type: string;
  sampleValues: string[];
}

export interface TableSchema {
  id: string;
  tableName: string;
  columns: TableColumn[];
  rowCount: number;
}

interface TableUploadProps {
  onSchemasChange: (schemas: TableSchema[]) => void;
  schemas: TableSchema[];
  selectedSchemaId: string | null;
  onSelectSchema: (id: string | null) => void;
}

const inferSqlType = (values: unknown[]): string => {
  const nonNullValues = values.filter((v) => v !== null && v !== undefined && v !== "");
  
  if (nonNullValues.length === 0) return "TEXT";
  
  const allNumbers = nonNullValues.every((v) => {
    const num = Number(v);
    return !isNaN(num) && v !== "";
  });
  
  if (allNumbers) {
    const hasDecimals = nonNullValues.some((v) => String(v).includes("."));
    return hasDecimals ? "DECIMAL" : "INTEGER";
  }
  
  const allDates = nonNullValues.every((v) => {
    const date = new Date(String(v));
    return !isNaN(date.getTime()) && String(v).match(/\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/);
  });
  
  if (allDates) return "DATE";
  
  const allBooleans = nonNullValues.every((v) => {
    const lower = String(v).toLowerCase();
    return ["true", "false", "yes", "no", "1", "0"].includes(lower);
  });
  
  if (allBooleans) return "BOOLEAN";
  
  return "TEXT";
};

const sanitizeColumnName = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/^[0-9]/, "_$&")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "") || "column";
};

const sanitizeTableName = (fileName: string): string => {
  const name = fileName.replace(/\.(csv|xlsx|xls|png|jpg|jpeg)$/i, "");
  return sanitizeColumnName(name) || "uploaded_table";
};

const generateId = () => Math.random().toString(36).substring(2, 9);

export default function TableUpload({ onSchemasChange, schemas, selectedSchemaId, onSelectSchema }: TableUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingType, setProcessingType] = useState<"file" | "image" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processSpreadsheet = async (file: File): Promise<TableSchema> => {
    const tableName = sanitizeTableName(file.name);
    let data: unknown[][] = [];
    
    if (file.name.endsWith(".csv")) {
      const text = await file.text();
      const workbook = XLSX.read(text, { type: "string" });
      const sheetName = workbook.SheetNames[0];
      data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 }) as unknown[][];
    } else {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 }) as unknown[][];
    }
    
    if (data.length < 2) {
      throw new Error("File must have at least a header row and one data row");
    }
    
    const headers = (data[0] as string[]).map((h, i) => 
      h ? sanitizeColumnName(String(h)) : `column_${i + 1}`
    );
    
    const rows = data.slice(1);
    
    const columns: TableColumn[] = headers.map((header, index) => {
      const columnValues = rows.map((row) => (row as unknown[])[index]);
      const sampleValues = columnValues
        .filter((v) => v !== null && v !== undefined && v !== "")
        .slice(0, 3)
        .map((v) => String(v));
      
      return {
        name: header,
        type: inferSqlType(columnValues),
        sampleValues,
      };
    });
    
    return {
      id: generateId(),
      tableName,
      columns,
      rowCount: rows.length,
    };
  };

  const processImage = async (file: File): Promise<TableSchema> => {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const response = await supabase.functions.invoke("extract-table-from-image", {
      body: { imageBase64: base64, fileName: file.name },
    });

    if (response.error) {
      throw new Error(response.error.message || "Failed to process image");
    }

    const data = response.data;

    if (!data.success) {
      throw new Error(data.error || "No table found in the image");
    }

    const tableName = data.tableName 
      ? sanitizeColumnName(data.tableName)
      : sanitizeTableName(file.name);
    const columns: TableColumn[] = data.headers.map((header: string, index: number) => {
      const sampleValues = data.rows
        .slice(0, 3)
        .map((row: string[]) => row[index] || "")
        .filter((v: string) => v !== "");

      return {
        name: sanitizeColumnName(header),
        type: data.columnTypes?.[index] || "TEXT",
        sampleValues,
      };
    });

    return {
      id: generateId(),
      tableName,
      columns,
      rowCount: data.rows.length,
    };
  };

  const processFile = async (file: File) => {
    setIsProcessing(true);
    const isImage = /\.(png|jpg|jpeg)$/i.test(file.name);
    setProcessingType(isImage ? "image" : "file");
    
    try {
      let extractedSchema: TableSchema;

      if (isImage) {
        extractedSchema = await processImage(file);
      } else {
        extractedSchema = await processSpreadsheet(file);
      }
      
      const newSchemas = [...schemas, extractedSchema];
      onSchemasChange(newSchemas);
      
      // Auto-select the newly uploaded table
      onSelectSchema(extractedSchema.id);
      
      toast({
        title: "Table uploaded successfully!",
        description: `Extracted ${extractedSchema.columns.length} columns from ${extractedSchema.rowCount} rows.`,
      });
    } catch (error) {
      console.error("Error processing file:", error);
      toast({
        title: "Failed to process file",
        description: error instanceof Error ? error.message : "Please upload a valid file.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setProcessingType(null);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const removeSchema = (id: string) => {
    const newSchemas = schemas.filter((s) => s.id !== id);
    onSchemasChange(newSchemas);
    if (selectedSchemaId === id) {
      onSelectSchema(newSchemas.length > 0 ? newSchemas[0].id : null);
    }
  };

  const selectedSchema = schemas.find((s) => s.id === selectedSchemaId);

  return (
    <div className="space-y-4">
      {/* Uploaded Tables List */}
      {schemas.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Uploaded Tables ({schemas.length})</p>
          <div className="flex flex-wrap gap-2">
            {schemas.map((schema) => (
              <div
                key={schema.id}
                onClick={() => onSelectSchema(schema.id)}
                className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${
                  selectedSchemaId === schema.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/50 bg-background/50 hover:border-primary/50"
                }`}
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span className="text-sm font-medium">{schema.tableName}</span>
                <span className="text-xs text-muted-foreground">
                  ({schema.columns.length} cols)
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSchema(schema.id);
                  }}
                  className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selected Table Schema Preview */}
      {selectedSchema && (
        <div className="gradient-card rounded-2xl p-4 border border-primary/30 bg-primary/5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <span className="font-semibold text-foreground">{selectedSchema.tableName}</span>
              <span className="text-xs text-muted-foreground">
                ({selectedSchema.columns.length} columns, {selectedSchema.rowCount} rows)
              </span>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {selectedSchema.columns.map((col, i) => (
              <div
                key={i}
                className="px-2.5 py-1 rounded-lg bg-background/80 border border-border/50 text-xs"
              >
                <span className="font-medium text-foreground">{col.name}</span>
                <span className="text-muted-foreground ml-1.5">({col.type})</span>
              </div>
            ))}
          </div>
          
          <div className="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-600 dark:text-amber-400">
              SQL will be generated using only columns from this table. Questions about unavailable data will show an error.
            </p>
          </div>
        </div>
      )}

      {/* Upload Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`relative border-2 border-dashed rounded-2xl p-6 text-center transition-all duration-200 cursor-pointer ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border/50 hover:border-primary/50 hover:bg-muted/30"
        }`}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.png,.jpg,.jpeg"
          onChange={handleFileSelect}
          className="hidden"
          disabled={isProcessing}
        />
        
        {isProcessing ? (
          <>
            <Loader2 className="h-8 w-8 mx-auto mb-3 text-primary animate-spin" />
            <p className="text-sm font-medium text-foreground mb-1">
              {processingType === "image" ? "Extracting table from image..." : "Processing..."}
            </p>
            <p className="text-xs text-muted-foreground">
              {processingType === "image" ? "Using AI to detect table structure" : "Reading file data"}
            </p>
          </>
        ) : (
          <>
            <div className="flex justify-center gap-2 mb-3">
              {schemas.length > 0 ? (
                <Plus className={`h-7 w-7 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
              ) : (
                <>
                  <Upload className={`h-7 w-7 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                  <Image className={`h-7 w-7 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                </>
              )}
            </div>
            
            <p className="text-sm font-medium text-foreground mb-1">
              {schemas.length > 0 ? "Add another table" : "Upload your table"}
            </p>
            <p className="text-xs text-muted-foreground">
              CSV, Excel, or <span className="text-primary font-medium">image of a table</span> (PNG, JPG)
            </p>
          </>
        )}
      </div>
    </div>
  );
}
