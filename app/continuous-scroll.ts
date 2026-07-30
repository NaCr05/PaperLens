export type PageFrameMetric = {
  pageNumber: number;
  offsetTop: number;
  height: number;
};

export function findClosestPageToViewportCenter(
  viewportTop: number,
  viewportHeight: number,
  frames: PageFrameMetric[],
  fallbackPage: number,
) {
  const viewportCenter = viewportTop + viewportHeight / 2;
  let closestPage = fallbackPage;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const frame of frames) {
    const pageCenter = frame.offsetTop + frame.height / 2;
    const distance = Math.abs(pageCenter - viewportCenter);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestPage = frame.pageNumber;
    }
  }

  return closestPage;
}

export function shouldRenderPage(pageNumber: number, activePage: number, overscan = 2) {
  return Math.abs(pageNumber - activePage) <= Math.max(0, overscan);
}
