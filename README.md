# Energia Insights

A comprehensive electricity usage dashboard for Irish energy customers. Upload your half-hourly usage CSV from [Energia](https://www.energia.ie) and get detailed analytics, cost comparisons, and energy-saving recommendations — all running locally in your browser with no data sent to any server.

Try it out today at [energy.chofter.com](https://energy.chofter.com)

## What It Does

### Usage Analytics

- **Daily, weekly, and monthly** usage charts with toggleable total vs daily average views
- **Hourly average** profile showing your typical consumption pattern across the day
- **Day detail** view with half-hourly bar chart, color-coded by time-of-use period (night, day, peak)
- **Usage heatmap** — a full grid of every day vs every 30-minute slot, showing usage intensity at a glance

### Period Comparisons

- Compare any week or month against the **previous period**
- Compare against the **same period last year** (when data is available)
- Side-by-side bar charts and percentage change indicators

### Tariff Analysis

- Pre-configured tariffs for major Irish providers (Energia, Bord Gais, Electric Ireland, SSE Airtricity)
- **Tiered pricing** support — rates that change after a set number of units (e.g. EV night rates with a high-usage tier)
- **Free day** support (e.g. Bord Gais Free Saturday, SSE Free Sundays)
- **Weekday/weekend** and **custom per-day** scheduling
- Compare your current tariff against any alternative and see **projected yearly savings**
- Daily cost line chart overlaying both tariffs
- Fully editable — adjust any rate, standing charge, PSO levy, or tier threshold

### Appliance Profiler

- Select the appliances you use (EV, dryer, washer, oven, storage heaters, heat pump, etc.)
- Adjust usage frequency to see an estimated breakdown of where your electricity goes
- Pie chart visualization of estimated usage by appliance
- Tailored energy-saving suggestions based on your appliance selection

### Insights & Trends

- Automatic detection of usage patterns: weekday vs weekend, night vs day, peak hours
- Early morning spike detection (suggesting EV charging or storage heaters)
- Highest and lowest usage days identified
- Time-of-use split pie chart

### Data Persistence

- Your CSV is stored in the browser's localStorage — refresh the page and your dashboard is still there
- Click "Upload New File" to clear stored data and start fresh

## Input Format

The app expects a CSV file exported from your Energia online account. The format is:

```
#MPRN: 10005282085
Date,00:00,00:30,01:00,01:30,...,23:00,23:30
2026-01-01,1.2975,1.3735,1.2305,...,1.292,1.3245
2026-01-02,1.698,1.5285,0.915,...,1.3695,1.4875
```

- First line: MPRN number (optional, used for display)
- Second line: header row with `Date` followed by 48 half-hour time slots
- Remaining lines: one row per day, with the date in `YYYY-MM-DD` format followed by 48 kWh readings

To download your data: log in at [energia.ie](https://www.energia.ie), go to **My Usage > Download Usage Data**, and export as CSV.

## Getting Started

```bash
# Install dependencies
npm install

# Run the development server
npm run dev
```

Open [http://localhost:3040](http://localhost:3040) and upload your CSV file.

### Build for Production

```bash
npm run build
npm start
```

## Tech Stack

- [Next.js](https://nextjs.org) 16 with App Router
- [React](https://react.dev) 19
- [Recharts](https://recharts.org) for data visualization
- [date-fns](https://date-fns.org) for date manipulation
- [Tailwind CSS](https://tailwindcss.com) 4 for styling
- TypeScript throughout

## Project Structure

```
app/
  page.tsx              # Main page — handles CSV loading and localStorage persistence
  layout.tsx            # Root layout with metadata
  globals.css           # Global styles
  lib/
    types.ts            # TypeScript interfaces (EnergyData, Tariff, RateTier, etc.)
    parseCSV.ts         # Energia CSV parser
    analytics.ts        # All data aggregation, trend detection, and tariff cost calculation
  components/
    FileUpload.tsx      # Drag-and-drop CSV upload
    Dashboard.tsx       # Main dashboard with tab navigation
    OverviewCards.tsx    # Summary stat cards
    UsageCharts.tsx     # Multi-view usage charts (daily/weekly/monthly/hourly/day detail)
    ComparisonView.tsx  # Period comparison (week/month vs previous or year ago)
    HeatmapView.tsx     # Usage heatmap grid
    TariffManager.tsx   # Tariff editor and comparison calculator
    ApplianceProfiler.tsx # Appliance selection, breakdown, and suggestions
    InsightsPanel.tsx   # Auto-generated insights and time-of-use pie chart
```

## Contributing

Contributions are welcome! Here's how to get involved:

1. **Fork** the repository at [github.com/shaneosullivan/energiastats](https://github.com/shaneosullivan/energiastats)
2. **Create a branch** for your feature or fix: `git checkout -b my-feature`
3. **Make your changes** and ensure the build passes: `npm run build`
4. **Commit** with a clear message describing what you changed and why
5. **Open a pull request** against `main`

### Ideas for Contributions

- Support for CSV formats from other Irish providers (Electric Ireland, Bord Gais, SSE Airtricity)
- Solar panel generation data overlay
- Export dashboard as PDF or image
- Dark mode
- Multi-file support to combine data across billing periods
- Carbon footprint estimation based on Ireland's grid mix
- Mobile-optimized layout improvements
- Accessibility improvements
- Unit tests for the analytics and CSV parsing logic

### Guidelines

- Keep the app client-side only — no user data should ever be sent to a server
- Follow the existing code style (TypeScript, functional components, Tailwind CSS)
- Test with real Energia CSV exports when possible
- Keep bundle size in mind — avoid heavy dependencies for small features

## Privacy

All data processing happens entirely in your browser. Your electricity usage data is never uploaded to any server. The only storage used is your browser's localStorage, which you can clear at any time by clicking "Upload New File" or clearing your browser data.

## License

MIT
