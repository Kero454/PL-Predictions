# Premier League Predictions Game 🏆

A real-time Premier League prediction game where friends can compete by predicting match scores and climbing the leaderboard!

## Features ✨

- **User Authentication**: Secure registration and login with JWT tokens
- **Match Predictions**: Predict scores for upcoming Premier League matches
- **Real-time Updates**: Live leaderboard updates via WebSocket
- **Scoring System**: 3 points for exact score, 1 point for correct result
- **Gameweek Doubler**: Double your points on one match per gameweek
- **Mobile Responsive**: Fully optimized for mobile devices
- **Season 2025-26**: Updated for the current Premier League season
- **Persistent Storage**: SQLite database for user data and predictions

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

1. Clone or download this repository
2. Navigate to the project directory
3. Install dependencies:
   ```bash
   npm install
   ```

4. Set up environment variables:
   - Copy `.env` file and update the JWT secret
   - Add your Football API key (optional for now - mock data is provided)

5. Start the server:
   ```bash
   npm start
   ```

6. Open your browser and go to `http://localhost:3000`

### Development Mode

For development with auto-restart:
```bash
npm run dev
```

## How to Play

1. **Register/Login**: Create an account or login with existing credentials
2. **View Matches**: See upcoming Premier League matches
3. **Make Predictions**: Click "Predict" on any upcoming match to enter your score prediction
4. **Earn Points**: Get points when your predictions match actual results
5. **Check Leaderboard**: See how you rank against your friends

## Scoring System

- **Exact Score**: 3 points
- **Correct Result (Win/Draw/Loss)**: 1 point
- **Wrong Prediction**: 0 points

## Deployment Options 🌐

### Option 1: Vercel (Recommended)
1. Install Vercel CLI: `npm i -g vercel`
2. Run: `vercel`
3. Follow the prompts

### Option 2: Netlify
1. Connect your GitHub repository to Netlify
2. Set build command: `npm install`
3. Set publish directory: `public`
4. Add environment variables in Netlify dashboard

### Option 3: Railway
1. Connect GitHub repository to Railway
2. Add environment variables
3. Deploy automatically

## API Integration 🔌

To get live Premier League data:

1. Register at [Football-Data.org](https://www.football-data.org/)
2. Get your free API key
3. Add it to your `.env` file as `FOOTBALL_API_KEY`

*Without API key, the app uses mock data for development*

## Tech Stack 🛠️

- **Backend**: Node.js, Express.js, Socket.io
- **Database**: SQLite3 for persistent storage
- **Authentication**: JWT tokens with bcrypt password hashing
- **Frontend**: Vanilla JavaScript, CSS3, HTML5
- **API**: Football-Data.org integration
- **Real-time**: WebSocket connections
- **Styling**: Modern responsive CSS with mobile optimization

## File Structure

```
PL-Predictions/
├── public/
│   ├── index.html      # Main HTML file
│   ├── styles.css      # CSS styling
│   └── script.js       # Frontend JavaScript
├── server.js           # Express server and API routes
├── package.json        # Dependencies and scripts
├── .env               # Environment variables
└── README.md          # This file
```

## Contributing

Feel free to fork this project and add new features like:
- Database integration (MongoDB, PostgreSQL)
- More detailed scoring systems
- Team statistics
- Push notifications
- Social features (comments, reactions)

## License

MIT License - feel free to use this project for your own prediction games!
