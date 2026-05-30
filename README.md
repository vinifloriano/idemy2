# Idemy

A desktop application for managing and watching video courses, built with Electron, React, and TypeScript.

## Features

- **Course Library:** Import and manage your local video courses.
- **Video Playback:** Watch videos with built-in progress tracking.
- **Notes & Bookmarks:** Take timestamped notes while watching videos (Press 'N').
- **Post-Video Flow:** Automatic countdown to the next video and a final review prompt upon course completion.

## Technologies Used

- [Electron](https://www.electronjs.org/)
- [React](https://reactjs.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Vite](https://vitejs.dev/)

## Getting Started

### Prerequisites

- Node.js (v18 or newer recommended)
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

### Running in Development

```bash
npm run dev
```

### Building for Production

```bash
npm run build
```

## Architecture

The project uses a standard Electron structure with separate main, preload, and renderer processes. See `.github/sdd/01-architecture/` for detailed architectural decisions.
