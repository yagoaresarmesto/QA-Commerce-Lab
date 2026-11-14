import { Prisma } from '@prisma/client';
import { RequestContext } from '../../common/request-context';

/**
 * Catalog isolation for automation runs.
 * Products created by an automation run (testRunId set) are only *listed* (listings, search,
 * home page, suggestions) for requests that send the same X-Test-Run-Id header.
 * Reference catalog data is always visible, so parallel suites never see each other's products
 * in listings. Direct access by id/slug, cart and checkout work for every product.
 */
export function catalogVisibilityScope(): Prisma.ProductWhereInput {
  const runId = RequestContext.testRunId();
  return runId ? { OR: [{ testRunId: null }, { testRunId: runId }] } : { testRunId: null };
}
