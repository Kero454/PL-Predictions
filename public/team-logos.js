// Premier League Team Logos - Real Crest Images from football-data.org
// Maps team names to their football-data.org team IDs for crest URLs

const TEAM_CRESTS = {
    'Arsenal':             { id: 57,   abbr: 'ARS', color: '#DC143C' },
    'Aston Villa':         { id: 58,   abbr: 'AVL', color: '#95BFE5' },
    'Bournemouth':         { id: 1044, abbr: 'BOU', color: '#DA020E' },
    'Brentford':           { id: 402,  abbr: 'BRE', color: '#E30613' },
    'Brighton':            { id: 397,  abbr: 'BHA', color: '#0057B8' },
    'Chelsea':             { id: 61,   abbr: 'CHE', color: '#034694' },
    'Crystal Palace':      { id: 354,  abbr: 'CRY', color: '#1B458F' },
    'Everton':             { id: 62,   abbr: 'EVE', color: '#003399' },
    'Fulham':              { id: 63,   abbr: 'FUL', color: '#000000' },
    'Ipswich Town':        { id: 349,  abbr: 'IPS', color: '#4169E1' },
    'Leicester City':      { id: 338,  abbr: 'LEI', color: '#003090' },
    'Liverpool':           { id: 64,   abbr: 'LIV', color: '#C8102E' },
    'Manchester City':     { id: 65,   abbr: 'MCI', color: '#6CABDD' },
    'Manchester United':   { id: 66,   abbr: 'MUN', color: '#DA020E' },
    'Newcastle United':    { id: 67,   abbr: 'NEW', color: '#241F20' },
    'Nottingham Forest':   { id: 351,  abbr: 'NFO', color: '#DD0000' },
    'Southampton':         { id: 340,  abbr: 'SOU', color: '#D71920' },
    'Tottenham':           { id: 73,   abbr: 'TOT', color: '#132257' },
    'West Ham':            { id: 563,  abbr: 'WHU', color: '#7A263A' },
    'Wolverhampton':       { id: 76,   abbr: 'WOL', color: '#FDB462' },
    'Burnley':             { id: 328,  abbr: 'BUR', color: '#6C1D45' },
    'Leeds United':        { id: 341,  abbr: 'LEE', color: '#FFCD00' },
    'Sunderland':          { id: 71,   abbr: 'SUN', color: '#EB172B' }
};

// Name aliases to normalize various team name formats
const TEAM_NAME_ALIASES = {
    'arsenal fc': 'Arsenal',
    'arsenal': 'Arsenal',
    'aston villa fc': 'Aston Villa',
    'aston villa': 'Aston Villa',
    'afc bournemouth': 'Bournemouth',
    'bournemouth': 'Bournemouth',
    'brentford fc': 'Brentford',
    'brentford': 'Brentford',
    'brighton & hove albion fc': 'Brighton',
    'brighton and hove albion': 'Brighton',
    'brighton': 'Brighton',
    'chelsea fc': 'Chelsea',
    'chelsea': 'Chelsea',
    'crystal palace fc': 'Crystal Palace',
    'crystal palace': 'Crystal Palace',
    'everton fc': 'Everton',
    'everton': 'Everton',
    'fulham fc': 'Fulham',
    'fulham': 'Fulham',
    'ipswich town fc': 'Ipswich Town',
    'ipswich town': 'Ipswich Town',
    'ipswich': 'Ipswich Town',
    'leicester city fc': 'Leicester City',
    'leicester city': 'Leicester City',
    'leicester': 'Leicester City',
    'liverpool fc': 'Liverpool',
    'liverpool': 'Liverpool',
    'manchester city fc': 'Manchester City',
    'manchester city': 'Manchester City',
    'man city': 'Manchester City',
    'manchester united fc': 'Manchester United',
    'manchester united': 'Manchester United',
    'man united': 'Manchester United',
    'man utd': 'Manchester United',
    'newcastle united fc': 'Newcastle United',
    'newcastle united': 'Newcastle United',
    'newcastle': 'Newcastle United',
    'nottingham forest fc': 'Nottingham Forest',
    'nottingham forest': 'Nottingham Forest',
    'nott\'m forest': 'Nottingham Forest',
    'southampton fc': 'Southampton',
    'southampton': 'Southampton',
    'tottenham hotspur fc': 'Tottenham',
    'tottenham hotspur': 'Tottenham',
    'tottenham': 'Tottenham',
    'spurs': 'Tottenham',
    'west ham united fc': 'West Ham',
    'west ham united': 'West Ham',
    'west ham': 'West Ham',
    'wolverhampton wanderers fc': 'Wolverhampton',
    'wolverhampton wanderers': 'Wolverhampton',
    'wolverhampton': 'Wolverhampton',
    'wolves': 'Wolverhampton',
    // Additional teams that may appear from API
    'burnley fc': 'Burnley',
    'burnley': 'Burnley',
    'leeds united fc': 'Leeds United',
    'leeds united': 'Leeds United',
    'leeds': 'Leeds United',
    'sunderland afc': 'Sunderland',
    'sunderland': 'Sunderland',
    'luton town fc': 'Luton Town',
    'luton town': 'Luton Town',
    'sheffield united fc': 'Sheffield United',
    'sheffield united': 'Sheffield United',
    'sheffield utd': 'Sheffield United'
};

// Extra teams not in main TEAM_CRESTS but might appear from API
const EXTRA_TEAMS = {
    'Luton Town':       { abbr: 'LUT', color: '#F78F1E' },
    'Sheffield United': { abbr: 'SHU', color: '#EE2737' }
};

// Normalize team name from any format to our canonical name
function normalizeTeamName(teamName) {
    if (!teamName) return teamName;
    const lower = teamName.toLowerCase().trim();
    return TEAM_NAME_ALIASES[lower] || teamName;
}

// Get crest image URL from football-data.org
function getTeamCrestUrl(teamName) {
    const normalized = normalizeTeamName(teamName);
    const team = TEAM_CRESTS[normalized];
    if (team) {
        return `https://crests.football-data.org/${team.id}.png`;
    }
    return null;
}

// Function to get team logo HTML - uses real crest images with SVG fallback
function getTeamLogoHTML(teamName) {
    const normalized = normalizeTeamName(teamName);
    const team = TEAM_CRESTS[normalized] || EXTRA_TEAMS[normalized];
    const crestUrl = getTeamCrestUrl(teamName);
    
    if (crestUrl) {
        // Use real crest image with fallback
        return `<img src="${crestUrl}" alt="${normalized}" class="team-crest-img" 
                onerror="this.style.display='none';this.nextElementSibling.style.display='inline-block'" loading="lazy"/>
                <span class="team-crest-fallback" style="display:none">
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                        <circle cx="14" cy="14" r="12" fill="${team ? team.color : '#666'}"/>
                        <text x="14" y="18" text-anchor="middle" fill="white" font-size="9" font-weight="bold">${team ? team.abbr : 'FC'}</text>
                    </svg>
                </span>`;
    }
    
    // Pure SVG fallback for unknown teams
    const color = team ? team.color : '#666666';
    const abbr = team ? team.abbr : teamName.substring(0, 3).toUpperCase();
    return `<svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="12" fill="${color}"/>
        <text x="14" y="18" text-anchor="middle" fill="white" font-size="9" font-weight="bold">${abbr}</text>
    </svg>`;
}
