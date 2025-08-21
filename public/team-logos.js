// Premier League Team Logos - SVG Icons
const teamLogosData = {
    'Arsenal': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#DC143C"/>
        <text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-weight="bold">ARS</text>
    </svg>`,
    
    'Aston Villa': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#95BFE5"/>
        <text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-weight="bold">AVL</text>
    </svg>`,
    
    'Bournemouth': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#DA020E"/>
        <text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-weight="bold">BOU</text>
    </svg>`,
    
    'Brentford': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#E30613"/>
        <text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-weight="bold">BRE</text>
    </svg>`,
    
    'Brighton': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#0057B8"/>
        <text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-weight="bold">BHA</text>
    </svg>`,
    
    'Chelsea': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#034694"/>
        <text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-weight="bold">CHE</text>
    </svg>`,
    
    'Crystal Palace': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#1B458F"/>
        <text x="12" y="16" text-anchor="middle" fill="white" font-size="9" font-weight="bold">CRY</text>
    </svg>`,
    
    'Everton': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#003399"/>
        <text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-weight="bold">EVE</text>
    </svg>`,
    
    'Fulham': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#000000"/>
        <text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-weight="bold">FUL</text>
    </svg>`,
    
    'Ipswich Town': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#4169E1"/>
        <text x="12" y="16" text-anchor="middle" fill="white" font-size="9" font-weight="bold">IPS</text>
    </svg>`,
    
    'Leicester City': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#003090"/>
        <text x="12" y="16" text-anchor="middle" fill="white" font-size="9" font-weight="bold">LEI</text>
    </svg>`,
    
    'Liverpool': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#C8102E"/>
        <text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-weight="bold">LIV</text>
    </svg>`,
    
    'Manchester City': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#6CABDD"/>
        <text x="12" y="16" text-anchor="middle" fill="white" font-size="9" font-weight="bold">MCI</text>
    </svg>`,
    
    'Manchester United': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#DA020E"/>
        <text x="12" y="16" text-anchor="middle" fill="white" font-size="9" font-weight="bold">MUN</text>
    </svg>`,
    
    'Newcastle United': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#241F20"/>
        <text x="12" y="16" text-anchor="middle" fill="white" font-size="9" font-weight="bold">NEW</text>
    </svg>`,
    
    'Nottingham Forest': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#DD0000"/>
        <text x="12" y="16" text-anchor="middle" fill="white" font-size="9" font-weight="bold">NFO</text>
    </svg>`,
    
    'Southampton': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#D71920"/>
        <text x="12" y="16" text-anchor="middle" fill="white" font-size="9" font-weight="bold">SOU</text>
    </svg>`,
    
    'Tottenham': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#132257"/>
        <text x="12" y="16" text-anchor="middle" fill="white" font-size="9" font-weight="bold">TOT</text>
    </svg>`,
    
    'West Ham': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#7A263A"/>
        <text x="12" y="16" text-anchor="middle" fill="white" font-size="9" font-weight="bold">WHU</text>
    </svg>`,
    
    'Wolverhampton': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#FDB462"/>
        <text x="12" y="16" text-anchor="middle" fill="black" font-size="9" font-weight="bold">WOL</text>
    </svg>`
};

// Function to get team logo HTML
function getTeamLogoHTML(teamName) {
    return teamLogosData[teamName] || `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#666666"/>
        <text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-weight="bold">FC</text>
    </svg>`;
}
