import SqlConverter from "@/components/SqlConverter";
import BackgroundDecoration from "@/components/BackgroundDecoration";
import { Database } from "lucide-react";

const Index = () => {
  return (
    <>
      <BackgroundDecoration />
      
      <main className="min-h-screen flex flex-col items-center justify-center px-4 py-10 relative">
        {/* Header */}
        <header className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center gap-3 mb-5">
            <div className="p-4 rounded-2xl gradient-button shadow-button">
              <Database className="h-9 w-9 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold font-display tracking-tight text-foreground mb-4">
            Text-to-SQL
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground/90 max-w-lg mx-auto leading-relaxed">
            Transform natural language into powerful SQL queries instantly
          </p>
        </header>

        {/* Converter */}
        <SqlConverter />
        
        {/* Footer */}
        <footer className="mt-10 text-center animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <p className="text-sm text-muted-foreground/60">
            Describe what you need • Get the perfect query
          </p>
        </footer>
      </main>
    </>
  );
};

export default Index;
