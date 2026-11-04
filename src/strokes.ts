export type Point = [number, number];
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function resample(points: Point[], count = 32): Point[] {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + distance(points[i - 1], points[i]));
  const total = cumulative[cumulative.length - 1];
  if (!total) return Array.from({ length: count }, () => points[0]);
  let j = 1;
  return Array.from({ length: count }, (_, i) => {
    const target = total * i / (count - 1);
    while (j < points.length - 1 && cumulative[j] < target) j++;
    const t = (target - cumulative[j - 1]) / Math.max(0.001, cumulative[j] - cumulative[j - 1]);
    return [points[j - 1][0] + t * (points[j][0] - points[j - 1][0]), points[j - 1][1] + t * (points[j][1] - points[j - 1][1])] as Point;
  });
}
// Compare ordered points, so reversed strokes and incorrect stroke order fail.
export function matchesStroke(input: Point[], expected: Point[]): boolean {
  if (input.length < 2 || expected.length < 2) return false;
  const a = resample(input), b = resample(expected);
  if (distance(a[0], b[0]) > 150 || distance(a[31], b[31]) > 150) return false;
  const length = (p: Point[]) => p.slice(1).reduce((s, v, i) => s + distance(p[i], v), 0);
  const ratio = length(input) / Math.max(1, length(expected));
  return ratio > 0.5 && ratio < 1.8 && a.reduce((s, p, i) => s + distance(p, b[i]), 0) / a.length < 100;
}
