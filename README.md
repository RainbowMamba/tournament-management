 # Tennis Tournament Manager

A modern web application for managing tennis tournaments, including qualifying rounds, main draw brackets, and real-time court scheduling.

## Features

- **Tournament Creation Wizard**: Create tournaments with optional qualifying rounds (round-robin groups) or direct main draw (single elimination)
- **Court View**: Assign matches to courts, start matches, and enter results in real-time
- **Draw View**: View group standings for qualifying and bracket visualization for main draw
- **Multi-user Support**: Secure authentication with user-owned tournaments
- **Modern UI**: Built with shadcn/ui components and a tennis-inspired color palette

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Auth.js (NextAuth v5)

## Getting Started

### Prerequisites

- Node.js 20.19+ or 22.12+
- PostgreSQL database
- npm or yarn

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd tournament_management
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
cp .env.example .env
```

Edit `.env` with your database connection string and auth secret:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/tournament_db?schema=public"
AUTH_SECRET="your-auth-secret-here"  # Generate with: openssl rand -base64 32
AUTH_URL="http://localhost:3000"
```

4. Generate Prisma client and push schema:

```bash
npm run db:generate
npm run db:push
```

5. (Optional) Seed the database with demo data:

```bash
npm run db:seed
```

6. Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Login/signup pages
│   ├── (dashboard)/       # Protected dashboard pages
│   └── api/               # API routes
├── components/
│   ├── layout/            # Navigation and layout components
│   ├── providers/         # React context providers
│   ├── tournament/        # Tournament-specific components
│   └── ui/                # shadcn/ui components
├── lib/
│   ├── actions/           # Server actions
│   ├── tournament/        # Tournament logic (round-robin, bracket)
│   ├── db.ts              # Prisma client
│   └── utils.ts           # Utility functions
├── auth.ts                # Auth.js configuration
└── middleware.ts          # Route protection middleware
```

## Tournament Workflow

1. **Create Tournament**: Enter name, location, courts, and choose format (qualifying + main or direct main draw)
2. **Add Teams**: Enter team names (auto-distributed to groups if qualifying)
3. **Generate Matches**: Click "Generate Matches" to create the schedule
4. **Manage Courts**: Assign matches to courts, start them, enter results
5. **Track Progress**: View standings (qualifying) and bracket (main draw)

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push schema to database
- `npm run db:migrate` - Run migrations
- `npm run db:studio` - Open Prisma Studio
- `npm run db:seed` - Seed database with demo data

## License

MIT
