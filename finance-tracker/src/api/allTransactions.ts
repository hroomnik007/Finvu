import { getTransactions } from './transactions'
import type { TransactionParams } from './transactions'
import type { ApiTransaction } from '../types'

const PAGE = 200 // the server's maximum page size
const MAX_PAGES = 50 // safety stop: 10 000 rows

// Every transaction matching the filters, fetched page by page. A single request returns
// at most 200 rows, so lists that can grow past that must not stop at the first page.
export async function getAllTransactions(params: Omit<TransactionParams, 'limit' | 'offset'>): Promise<ApiTransaction[]> {
  const all: ApiTransaction[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data } = await getTransactions({ ...params, limit: PAGE, offset: page * PAGE })
    all.push(...data)
    if (data.length < PAGE) break
  }
  return all
}
