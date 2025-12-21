import initSqlJs, { Database } from 'sql.js';

export interface HighScore {
  id?: number;
  playerName: string;
  score: number;
  distance: number;
  timestamp: number;
}

export class HighScoreManager {
  private db: Database | null = null;
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize sql.js
      const SQL = await initSqlJs({
        locateFile: (file) => `https://sql.js.org/dist/${file}`
      });

      // Try to load existing database from localStorage
      const savedDb = localStorage.getItem('highscores_db');
      if (savedDb) {
        const uint8Array = new Uint8Array(JSON.parse(savedDb));
        this.db = new SQL.Database(uint8Array);
      } else {
        this.db = new SQL.Database();
        this.createTable();
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  private createTable(): void {
    if (!this.db) return;

    this.db.run(`
      CREATE TABLE IF NOT EXISTS high_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_name TEXT NOT NULL,
        score INTEGER NOT NULL,
        distance REAL NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);
    this.saveToLocalStorage();
  }

  private saveToLocalStorage(): void {
    if (!this.db) return;

    const data = this.db.export();
    const json = JSON.stringify(Array.from(data));
    localStorage.setItem('highscores_db', json);
  }

  async addScore(playerName: string, score: number, distance: number): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }
    if (!this.db) return;

    const timestamp = Date.now();

    // Insert the new score
    this.db.run(
      'INSERT INTO high_scores (player_name, score, distance, timestamp) VALUES (?, ?, ?, ?)',
      [playerName, score, distance, timestamp]
    );

    // Keep only top 10 scores
    this.db.run(`
      DELETE FROM high_scores
      WHERE id NOT IN (
        SELECT id FROM high_scores
        ORDER BY score DESC
        LIMIT 10
      )
    `);

    this.saveToLocalStorage();
  }

  async getTopScores(limit: number = 10): Promise<HighScore[]> {
    if (!this.db) {
      await this.initialize();
    }
    if (!this.db) return [];

    const result = this.db.exec(
      'SELECT id, player_name, score, distance, timestamp FROM high_scores ORDER BY score DESC LIMIT ?',
      [limit]
    );

    if (result.length === 0) return [];

    const scores: HighScore[] = [];
    const rows = result[0].values;

    for (const row of rows) {
      scores.push({
        id: row[0] as number,
        playerName: row[1] as string,
        score: row[2] as number,
        distance: row[3] as number,
        timestamp: row[4] as number
      });
    }

    return scores;
  }

  async isHighScore(score: number): Promise<boolean> {
    if (!this.db) {
      await this.initialize();
    }
    if (!this.db) return true; // If no scores yet, any score is a high score

    const topScores = await this.getTopScores(10);

    // If less than 10 scores, it's always a high score
    if (topScores.length < 10) return true;

    // Check if score is higher than the 10th place
    const tenthPlace = topScores[9];
    return score > tenthPlace.score;
  }

  async getLowestHighScore(): Promise<number> {
    const topScores = await this.getTopScores(10);
    if (topScores.length < 10) return 0;
    return topScores[9].score;
  }

  async clearAllScores(): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }
    if (!this.db) return;

    this.db.run('DELETE FROM high_scores');
    this.saveToLocalStorage();
  }
}
