export type WeaponId = 'peacemaker' | 'trembler' | 'punisher' | 'grapple';

export type RankGrade = 'S' | 'A' | 'B' | 'C' | 'D' | '-';

export interface StyleBreakdown {
  movementPoints: number;
  airtimePoints: number;
  multikillPoints: number;
  movementRank: RankGrade;
  airtimeRank: RankGrade;
  multikillRank: RankGrade;
  overallStyleRank: string;
}

export interface LevelResult {
  completed: boolean;
  rank: RankGrade;
  score: number;
  timeSec: number;
  kills: number;
  totalEnemies: number;
  styleBreakdown?: StyleBreakdown;
}

export interface PlayerProgress {
  completedLevels: Record<number, LevelResult>;
  unlockedWeapons: {
    peacemaker: boolean;
    trembler: boolean;
    punisher: boolean;
    grapple: boolean;
  };
  highScore: number;
  settings: {
    sensitivity: number;
    soundVolume: number;
    musicVolume: number;
    invertY: boolean;
    fov: number;
  };
}

export interface WeaponInfo {
  id: WeaponId;
  name: string;
  code: string;
  description: string;
  primaryName: string;
  secondaryName: string;
  secondaryCd: number;
  unlockedBy: string;
  color: string;
}

export type EnemyType =
  // Chapter 1 (City 1-4)
  | 'robo_doman'
  | 'doman_sniper'
  | 'drone'
  // Chapter 2 (Subway 5-8)
  | 'centipede'
  | 'worm'
  | 'spider_spitter'
  // Chapter 3 (Mine 9-12)
  | 'doman_dynamiter'
  | 'doman_miner'
  | 'doman_archer'
  // Chapter 4 (Hell 13-16)
  | 'imp_doman'
  | 'winged_doman'
  | 'skeleton_doman'
  // Bosses
  | 'boss_goliath'
  | 'boss_worm'
  | 'boss_miner'
  | 'boss_overlord'
  | 'boss_ultradoman';

export interface StyleRating {
  name: string;
  color: string;
  multiplier: number;
}

export const STYLE_RANKS: StyleRating[] = [
  { name: 'DESTRUCTIVE', color: '#3b82f6', multiplier: 1.0 },
  { name: 'SAVAGE', color: '#10b981', multiplier: 1.2 },
  { name: 'SUPREME', color: '#f59e0b', multiplier: 1.5 },
  { name: 'SSADISTIC', color: '#ec4899', multiplier: 2.0 },
  { name: 'ULTRAKILL', color: '#ef4444', multiplier: 3.0 },
];
