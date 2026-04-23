export type ProblemIndex = {
  rootPath: string;
  allFiles: string[];
  dirChildren: Record<string, string[]>;
  dirFiles: Record<string, string[]>;
  sgfAssetByProblemPath: Record<string, string>;
  thumbAssetByProblemPath: Record<string, string | null>;
};
