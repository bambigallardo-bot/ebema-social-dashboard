export const metadata = {
  title: "Ebema · Informe de Redes",
  description: "Informe mensual de Instagram, Facebook, Meta Ads y Email Marketing",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <style>{`
          @media print {
            body { background: #fff !important; color: #111 !important; }
            .no-print { display: none !important; }
            details { display: block !important; }
            details > summary { display: none !important; }
            section { break-inside: avoid; }
          }
        `}</style>
      </head>
      <body
        style={{
          margin: 0,
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          background: "#0b1220",
          color: "#e6edf6",
        }}
      >
        {children}
      </body>
    </html>
  );
}
