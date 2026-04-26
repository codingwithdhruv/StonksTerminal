# 🚀 Pre-Market Intelligence Dashboard

A high-performance, real-time market intelligence platform designed to identify high-potential "Gappers" before the opening bell. This dashboard combines low-latency market data, multi-source news aggregation, and AI-driven catalyst summarization to provide a "Pro Max" institutional-grade trading edge.

![Market Dashboard](https://images.unsplash.com/photo-1611974714024-462cd013360b?auto=format&fit=crop&q=80&w=1200)

## ✨ Core Features

### 📈 Real-Time Gapper Detection
- **Dynamic Screener**: Monitors top-volume tickers and identifies significant price gaps up/down compared to the previous close.
- **Performance Grading**: Automatically assigns grades (**Grade A-D**) based on a weighted calculation of gap percentage, relative volume, and price action.
- **Low-Latency Updates**: Powered by the Alpaca Data API for rapid pre-market snapshotting.

### 📰 Triple-Source News Aggregator
- **Unified Feed**: Seamlessly merges live news from **Alpaca**, **Seeking Alpha**, and **Yahoo Finance**.
- **Source Labeling**: Every catalyst is clearly tagged with its origin for verification.
- **Auto-Refresh**: News feed updates automatically every 5 minutes to ensure no catalyst is missed.

### 🧠 Smart Catalyst Categorization
- **Heuristic Classification**: Uses advanced regex logic to categorize news into specific financial themes:
  - 💰 **Earnings**: Revenue beats, EPS surprises, and guidance.
  - 🧬 **FDA**: Clinical trials, phase approvals, and medical breakthroughs.
  - 🤝 **Partnerships**: Mergers, acquisitions, and strategic deals.
  - 📉 **Offerings**: Share dilutions, secondary offerings, and capital raises.
  - 📦 **Orders**: Significant contracts and government awards.

### 🤖 AI Market Summarization (NVIDIA NIM)
- **On-Demand Intelligence**: Generate a comprehensive market summary with a single click.
- **Context-Aware**: Powered by **NVIDIA NIM (Llama 3.1 8B)** to analyze aggregated headlines and provide actionable insights.
- **Zero-Waste API**: Only generates summaries when requested to optimize API usage and maintain performance.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 15+](https://nextjs.org/) (App Router)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) with Glassmorphism effects
- **Components**: [Shadcn/UI](https://ui.shadcn.com/) (Customized)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Data Fetching**: Axios & Fetch API
- **Market Data**: [Alpaca Markets](https://alpaca.markets/)
- **News APIs**: Alpaca, Seeking Alpha (via RapidAPI), Yahoo Finance (via RapidAPI)
- **AI Engine**: [NVIDIA NIM](https://www.nvidia.com/en-us/ai-data-science/generative-ai/nim/)

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+ 
- Alpaca Market Data Key
- RapidAPI Key (for Seeking Alpha & Yahoo Finance)
- NVIDIA NIM API Key

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/dhruv/StonksTerminal.git
   cd pre-market-gappers
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables (`.env.local`):
   ```env
   ALPACA_API_KEY_ID=your_alpaca_key
   ALPACA_API_SECRET_KEY=your_alpaca_secret
   ALPACA_DATA_URL=https://data.alpaca.markets

   RAPIDAPI_KEY=your_rapidapi_key
   NIM_API_KEY=your_nvidia_nim_key
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

---

## 📁 Directory Structure

```text
├── src/
│   ├── app/
│   │   ├── api/                # Backend API Routes
│   │   │   ├── market/         # Alpaca Gapper Logic
│   │   │   ├── news/           # Alpaca News & Categorizer
│   │   │   ├── seeking-alpha/  # SA Integration
│   │   │   ├── yahoo-finance/  # Yahoo Integration
│   │   │   └── summarize/      # NVIDIA NIM AI Summary
│   │   ├── globals.css         # Pro Max Theme Tokens
│   │   ├── layout.tsx          # App Shell
│   │   └── page.tsx            # Main Dashboard UI
│   ├── components/             # Shadcn & Custom Components
│   └── lib/                    # Shared Utilities
├── public/                     # Static Assets
└── package.json                # Project Dependencies
```

---

## 🎨 Design Philosophy: "Pro Max" Aesthetic

The dashboard is built with a focus on **Visual Excellence** and **Actionable Data**:
- **Dark Mode by Default**: Deep slate backgrounds with vibrant accents.
- **Glassmorphism**: Backdrop blurs on cards and modals for a premium feel.
- **Micro-Animations**: Smooth transitions and ping indicators for "live" status.
- **Color Coding**: Grade-specific badges (Emerald for A, Rose for D) to highlight high-potential setups instantly.

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

*Built with ❤️ for High-Performance Traders.*
