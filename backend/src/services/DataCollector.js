const axios = require('axios');
const db = require('../config/db');

class DataCollector {
  static async collectMatches() {
    try {
      const apiKey = process.env.PANDA_API_KEY;
      const baseUrl = process.env.PANDA_API_URL;

      console.log('📊 Collecting matches from PandaScore API...');

      const response = await axios.get(`${baseUrl}/matches`, {
        params: {
          token: apiKey,
          status: 'not_started',
          per_page: 50,
          sort: 'scheduled_at'
        }
      });

      const matches = response.data;
      console.log(`✅ Retrieved ${matches.length} matches`);

      let saved = 0;
      for (const match of matches) {
        let format = 'UNKNOWN';
        if (match.number_of_games === 1) format = 'EA_FC_1V1';
        else if (match.number_of_games === 2) format = 'EA_FC_2V2';
        else if (match.number_of_games === 3) format = 'EA_FC_3V3';
        else if (match.number_of_games === 4) format = 'EA_FC_4V4';

        const homeTeam = match.opponents?.[0]?.opponent?.name || 'TBD';
        const awayTeam = match.opponents?.[1]?.opponent?.name || 'TBD';

        await new Promise((resolve, reject) => {
          db.run(
            `INSERT OR REPLACE INTO matches 
             (id, competition, format, home_team, away_team, home_id, away_id, match_time, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              match.id.toString(),
              match.league?.name || 'FIFA',
              format,
              homeTeam,
              awayTeam,
              match.opponents?.[0]?.opponent?.id || null,
              match.opponents?.[1]?.opponent?.id || null,
              match.scheduled_at,
              'upcoming'
            ],
            function(err) {
              if (err) {
                console.error('Error saving match:', err);
                reject(err);
              } else {
                resolve(this.changes);
              }
            }
          );
        });
        saved++;
      }

      console.log(`✅ Saved ${saved} matches to database`);
      return matches;

    } catch (error) {
      console.error('❌ Error collecting matches:', error.response?.data || error.message);
      return [];
    }
  }

  static async collectTeams() {
    try {
      const apiKey = process.env.PANDA_API_KEY;
      const baseUrl = process.env.PANDA_API_URL;

      console.log('📊 Collecting teams from PandaScore API...');

      const response = await axios.get(`${baseUrl}/teams`, {
        params: {
          token: apiKey,
          per_page: 100
        }
      });

      console.log(`✅ Retrieved ${response.data.length} teams`);
      return response.data;

    } catch (error) {
      console.error('❌ Error collecting teams:', error.response?.data || error.message);
      return [];
    }
  }

  static async collectStats(matchId) {
    try {
      const apiKey = process.env.PANDA_API_KEY;
      const baseUrl = process.env.PANDA_API_URL;

      const response = await axios.get(`${baseUrl}/matches/${matchId}/stats`, {
        params: { token: apiKey }
      });

      return response.data;

    } catch (error) {
      console.error('❌ Error collecting stats:', error.response?.data || error.message);
      return null;
    }
  }
}

module.exports = DataCollector;