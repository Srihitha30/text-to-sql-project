export default function BackgroundDecoration() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
      {/* Deep black base */}
      <div className="absolute inset-0 bg-background" />
      
      {/* Neon gradient overlay */}
      <div className="absolute inset-0 gradient-bg animate-gradient opacity-30" />
      
      {/* Floating neon orbs */}
      <div 
        className="absolute top-10 left-5 w-80 h-80 rounded-full animate-float"
        style={{ 
          background: 'radial-gradient(circle, hsla(320, 100%, 55%, 0.4) 0%, transparent 70%)',
          filter: 'blur(60px)'
        }}
      />
      <div 
        className="absolute top-32 right-10 w-[28rem] h-[28rem] rounded-full animate-float"
        style={{ 
          background: 'radial-gradient(circle, hsla(280, 100%, 60%, 0.35) 0%, transparent 70%)',
          filter: 'blur(70px)',
          animationDelay: '-2s'
        }}
      />
      <div 
        className="absolute bottom-10 left-1/4 w-96 h-96 rounded-full animate-float"
        style={{ 
          background: 'radial-gradient(circle, hsla(180, 100%, 50%, 0.3) 0%, transparent 70%)',
          filter: 'blur(60px)',
          animationDelay: '-4s'
        }}
      />
      <div 
        className="absolute bottom-32 right-1/4 w-72 h-72 rounded-full animate-pulse-slow"
        style={{ 
          background: 'radial-gradient(circle, hsla(45, 100%, 55%, 0.3) 0%, transparent 70%)',
          filter: 'blur(50px)'
        }}
      />
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[50rem] h-[50rem] rounded-full animate-pulse-slow"
        style={{ 
          background: 'radial-gradient(circle, hsla(320, 100%, 50%, 0.15) 0%, transparent 50%)',
          filter: 'blur(100px)',
          animationDelay: '-1s'
        }}
      />
      
      {/* Subtle grid overlay */}
      <div 
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `
            linear-gradient(to right, hsl(180 100% 50%) 1px, transparent 1px),
            linear-gradient(to bottom, hsl(180 100% 50%) 1px, transparent 1px)
          `,
          backgroundSize: '80px 80px'
        }}
      />
    </div>
  );
}