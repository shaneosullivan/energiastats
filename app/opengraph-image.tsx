import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "Energia Insights - Electricity Usage Dashboard";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "24px",
            marginBottom: "40px",
          }}
        >
          <div
            style={{
              fontSize: "80px",
            }}
          >
            ⚡
          </div>
          <div
            style={{
              fontSize: "64px",
              fontWeight: 800,
              color: "#ffffff",
              letterSpacing: "-2px",
            }}
          >
            Energia Insights
          </div>
        </div>

        <div
          style={{
            fontSize: "28px",
            color: "#94a3b8",
            textAlign: "center",
            maxWidth: "800px",
            lineHeight: 1.5,
          }}
        >
          Analyse your electricity usage with detailed insights, tariff
          comparisons, and battery & EV savings simulations
        </div>

        <div
          style={{
            display: "flex",
            gap: "32px",
            marginTop: "48px",
          }}
        >
          {["📊 Usage Charts", "⚖️ Tariff Compare", "🔬 Simulate Savings"].map(
            (label) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "rgba(255,255,255,0.1)",
                  borderRadius: "12px",
                  padding: "12px 24px",
                  fontSize: "22px",
                  color: "#e2e8f0",
                }}
              >
                {label}
              </div>
            ),
          )}
        </div>

        <div
          style={{
            position: "absolute",
            bottom: "32px",
            fontSize: "18px",
            color: "#64748b",
          }}
        >
          Free & open source · Your data stays on your device
        </div>
      </div>
    ),
    { ...size },
  );
}
