# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **EPS Pool Calculator** - a commercial pool estimating tool for calculating project costs for cold plunge and hot tub installations. The application computes material, labor, equipment, freight, and overhead costs based on vessel dimensions and project-specific parameters.

**Tech Stack:**
- React 18.2 with TypeScript
- Vite 5.4 (build tool)
- Tailwind CSS (via CDN)
- No backend - pure client-side application

## Common Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Architecture & Code Structure

### Component Hierarchy
- **`src/index.tsx`** - Entry point, renders App into DOM
- **`src/App.tsx`** - Main app shell with header
- **`src/components/EpsPoolCalculator.tsx`** - Single monolithic calculator component containing all business logic

### Key Architecture Notes

**Monolithic Component Design:**
The entire calculator is intentionally built as a single large component (`EpsPoolCalculator.tsx`, ~700 lines). All state, calculations, and UI are colocated in this file. This is a deliberate design choice for this application.

**State Management:**
- Uses React `useState` extensively for all configuration values and vessel data
- Uses `useMemo` for derived calculations to optimize performance
- No external state management library (Redux, Zustand, etc.)

**Calculation Flow:**
1. **Per-Vessel Calculations** (`vesselCalcs`) - Computed in first `useMemo`
   - Calculates surface areas (floor, walls, benches, finish total)
   - Computes materials costs (EPS, tile, FF&E)
   - Computes equipment costs based on selected package
   - Computes labor costs with type-specific adjustments

2. **Project Rollup** (`project`) - Computed in second `useMemo`
   - Aggregates all vessel costs
   - Applies project-level costs (freight, design, startup, rigging, chemical storage)
   - Allocates project costs proportionally to vessels
   - Applies design contingency, waste, OH&P, and warranty calculations
   - Produces final client pricing

**Cost Allocation Strategy:**
Project-level costs (freight, design/engineering, rep onsite, startup, chemical storage, rigging) are allocated to individual vessels proportionally based on each vessel's direct cost share.

**Pricing Layers (in order):**
1. Direct costs (materials + equipment + labor per vessel)
2. Project-level allocations
3. Design development contingency (% of base)
4. Waste (% of base+contingency)
5. OH&P (% of base+contingency)
6. Warranty (% of final client price, solved backwards)

### Equipment Package System

Equipment packages are defined in `DEFAULT_PACKAGES` array with the following structure:
- Each package has a `key`, `label`, `appliesTo` (vessel types), and `items` (line items with costs)
- Cold Plunge packages: CP 1-2, CP 3-4, CP 5-6, CP 7-8, CP 9-10, CP 11-12, CP 13-15+
- Hot Tub package: HT Standard (6-8 jets)
- Equipment packages are editable at runtime via the UI

### Vessel Types

**Cold Plunge:**
- Has refrigeration line option
- Uses chiller-based equipment packages
- Default interconnect labor: $15,000/vessel

**Hot Tub:**
- Has jets count (affects labor complexity)
- Uses gas heater + jet pump equipment packages
- Interconnect labor: 1.5× base rate ($22,500/vessel)

## TypeScript Configuration

TypeScript strict mode is enabled except `noImplicitAny: false`. This allows implicit any types throughout the codebase.

## Build & Deployment

- Build output directory: `dist/`
- Configured for Vercel deployment (see `vercel.json`)
- Vite uses rollup for production builds
- Entry HTML: `index.html` (includes Tailwind CDN script)

## Development Notes

**When modifying calculations:**
- Both `useMemo` dependencies arrays must be kept in sync with referenced state
- Test cost allocation logic carefully - project costs are distributed proportionally
- Warranty is calculated as percentage of final client price, requiring reverse calculation

**When adding new cost parameters:**
1. Add state variable with `useState`
2. Add input UI in relevant Card section
3. Update appropriate `useMemo` dependency array
4. Include in calculation logic (either `vesselCalcs` or `project`)

**Scopes system:**
The app has toggleable scopes (Materials, Labor, Equipment, Freight, Design & Engineering, Design Contingency, Warranty) that conditionally include/exclude cost buckets from calculations.
