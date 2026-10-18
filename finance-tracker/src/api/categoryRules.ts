import { apiClient } from './client'
import type { ImportRule } from '../utils/importRules'

export async function getCategoryRules(): Promise<ImportRule[]> {
  const { data } = await apiClient.get('/api/category-rules')
  return (data as { data: ImportRule[] }).data
}

export async function saveCategoryRule(keyword: string, categoryId: string): Promise<ImportRule> {
  const { data } = await apiClient.post('/api/category-rules', { keyword, categoryId })
  return (data as { data: ImportRule }).data
}

export async function deleteCategoryRule(id: string): Promise<void> {
  await apiClient.delete(`/api/category-rules/${id}`)
}
