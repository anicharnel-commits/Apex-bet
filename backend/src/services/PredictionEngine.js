const db = require('../config/db');

class PredictionEngine {
  static async generatePrediction(matchId) {
    const match = await new Promise((resolve) => {
      db.get('SELECT * FROM matches WHERE id = ?', [matchId], (err, row) => {
        resolve(row);
      });
    });

    if (!match) {
      return this.getEmptyPrediction('Match not found');
    }

    const homeHistory = await this.getTeamHistory(match.home_team, match.format);
    const awayHistory = await this.getTeamHistory(match.away_team, match.format);

    const stats = this.calculateStats(homeHistory, awayHistory);
    const adjusted = this.applyFormatAdjustments(stats, match.format);
    const dataQuality = this.calculateDataQuality(homeHistory, awayHistory);
    const confidence = this.calculateConfidence(adjusted, dataQuality);
    const signal = this.determineSignal(adjusted);

    if (dataQuality < 40 || confidence < 40) {
      return {
        ...this.getEmptyPrediction('Insufficient data'),
        data_quality: dataQuality,
        confidence: confidence,
        signal: 'NO BET'
      };
    }

    return {
      home_prob: Math.round(adjusted.home * 100) / 100,
      draw_prob: Math.round(adjusted.draw * 100) / 100,
      away_prob: Math.round(adjusted.away * 100) / 100,
      over15_prob: Math.round((adjusted.over15 || 0.5) * 100) / 100,
      over25_prob: Math.round((adjusted.over25 || 0.5) * 100) / 100,
      over35_prob: Math.round((adjusted.over35 || 0.3) * 100) / 100,
      btts_prob: Math.round((adjusted.btts || 0.5) * 100) / 100,
      confidence: Math.min(confidence, 95),
      data_quality: dataQuality,
      recommended_market: this.getRecommendedMarket(adjusted),
      signal: signal,
      edge: this.calculateEdge(adjusted),
      ev: this.calculateEV(adjusted),
      fair_odds: {
        home: (1 / adjusted.home).toFixed(2),
        draw: (1 / adjusted.draw).toFixed(2),
        away: (1 / adjusted.away).toFixed(2)
      }
    };
  }

  static getEmptyPrediction(reason = 'NO BET') {
    return {
      home_prob: 0,
      draw_prob: 0,
      away_prob: 0,
      over15_prob: 0,
      over25_prob: 0,
      over35_prob: 0,
      btts_prob: 0,
      confidence: 0,
      data_quality: 0,
      recommended_market: 'NO BET',
      signal: 'NO BET',
      edge: 0,
      ev: 0,
      fair_odds: { home: 0, draw: 0, away: 0 }
    };
  }

  static async getTeamHistory(teamName, format) {
    return new Promise((resolve) => {
      db.all(
        `SELECT * FROM matches 
         WHERE (home_team = ? OR away_team = ?) 
         AND format = ? 
         AND status = 'finished'
         ORDER BY match_time DESC 
         LIMIT 20`,
        [teamName, teamName, format],
        (err, rows) => {
          resolve(rows || []);
        }
      );
    });
  }

  static calculateStats(homeHistory, awayHistory) {
    const homeForm = this.calculateForm(homeHistory);
    const awayForm = this.calculateForm(awayHistory);

    const homeScore = homeForm.avgGoalsFor || 1.5;
    const awayScore = awayForm.avgGoalsFor || 1.5;
    const totalGoals = homeScore + awayScore;

    const homeShare = homeScore / (homeScore + awayScore + 0.5);
    const awayShare = awayScore / (homeScore + awayScore + 0.5);

    return {
      home: Math.min(Math.max(homeShare * 0.8 + 0.3, 0.2), 0.8),
      draw: Math.min(Math.max(1 - homeShare - awayShare + 0.1, 0.1), 0.4),
      away: Math.min(Math.max(awayShare * 0.8 + 0.1, 0.1), 0.7),
      over25: Math.min(Math.max(totalGoals / 3.5, 0.3), 0.8),
      over15: Math.min(Math.max(totalGoals / 2.5, 0.4), 0.9),
      over35: Math.min(Math.max(totalGoals / 4.5, 0.1), 0.6),
      btts: Math.min(Math.max((homeScore + awayScore) / 4, 0.2), 0.8)
    };
  }

  static calculateForm(history) {
    if (!history || history.length === 0) {
      return { avgGoalsFor: 1.5, avgGoalsAgainst: 1.5, wins: 0, draws: 0, losses: 0 };
    }

    let goalsFor = 0;
    let goalsAgainst = 0;

    history.forEach(match => {
      goalsFor += 1.5;
      goalsAgainst += 1.2;
    });

    return {
      avgGoalsFor: goalsFor / history.length,
      avgGoalsAgainst: goalsAgainst / history.length,
      wins: 0,
      draws: 0,
      losses: 0
    };
  }

  static applyFormatAdjustments(stats, format) {
    const adjusted = { ...stats };

    switch (format) {
      case 'EA_FC_4V4':
        adjusted.home *= 1.05;
        adjusted.away *= 1.05;
        adjusted.over25 *= 1.1;
        adjusted.btts *= 1.1;
        break;
      case 'EA_FC_2V2':
        adjusted.draw *= 1.1;
        break;
      case 'EA_FC_1V1':
        adjusted.home *= 0.95;
        adjusted.away *= 0.95;
        break;
      default:
        break;
    }

    const total = adjusted.home + adjusted.draw + adjusted.away;
    adjusted.home /= total;
    adjusted.draw /= total;
    adjusted.away /= total;

    return adjusted;
  }

  static calculateDataQuality(homeHistory, awayHistory) {
    const homeCount = homeHistory?.length || 0;
    const awayCount = awayHistory?.length || 0;
    const total = homeCount + awayCount;

    if (total < 5) return 30;
    if (total < 10) return 50;
    if (total < 20) return 70;
    return 85;
  }

  static calculateConfidence(stats, dataQuality) {
    const spread = Math.max(stats.home, stats.away) - stats.draw;
    const baseConfidence = Math.min(50 + spread * 50, 90);
    return Math.min(Math.round(baseConfidence * (dataQuality / 100)), 95);
  }

  static determineSignal(stats) {
    if (stats.home > 0.50) return 'HOME';
    if (stats.away > 0.50) return 'AWAY';
    if (stats.draw > 0.35) return 'DRAW';
    return 'NEUTRAL';
  }

  static getRecommendedMarket(stats) {
    const markets = [];
    if (stats.home > 0.45) markets.push('HOME');
    if (stats.away > 0.45) markets.push('AWAY');
    if (stats.draw > 0.30) markets.push('DRAW');
    if (stats.over25 > 0.55) markets.push('OVER 2.5');
    if (stats.btts > 0.55) markets.push('BTTS YES');
    return markets.length > 0 ? markets.join(' / ') : '1X2';
  }

  static calculateEdge(stats) {
    const marketHome = 1 / (stats.home + 0.05);
    const modelHome = 1 / stats.home;
    return Math.round(((modelHome - marketHome) / marketHome) * 100);
  }

  static calculateEV(stats) {
    const marketOdds = {
      home: 1 / (stats.home + 0.05),
      draw: 1 / (stats.draw + 0.05),
      away: 1 / (stats.away + 0.05)
    };
    const ev = (stats.home * marketOdds.home) - 1;
    return Math.round(ev * 100) / 100;
  }
}

module.exports = PredictionEngine;