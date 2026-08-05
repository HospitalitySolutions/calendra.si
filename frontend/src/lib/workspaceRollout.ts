import type { User, WorkspaceRolloutFeature } from './types'

export function isWorkspaceRolloutEnabled(
  user: Pick<User, 'workspaceRolloutFeatures'> | null | undefined,
  feature: WorkspaceRolloutFeature,
): boolean {
  return user?.workspaceRolloutFeatures == null || user.workspaceRolloutFeatures.includes(feature)
}
