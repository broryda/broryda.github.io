export type ProblemIndex = {
  rootPath: string;
  allFiles: string[];
  dirChildren: Record<string, string[]>;
  dirFiles: Record<string, string[]>;
  sgfAssetByProblemPath: Record<string, string>;
  thumbAssetByProblemPath: Record<string, string | null>;
  gradeByProblemPath: Record<string, string | null>;
  ratingByProblemPath: Record<string, number | null>;
  challengeTooLargeByProblemPath: Record<string, boolean>;
};
