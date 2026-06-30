// docs/03 §5.4 — packages module barrel.

export {
  listPackages,
  getPackage,
  createPackage,
  updatePackage,
  archivePackage,
  reorderPackages,
  setFeaturedSlot,
  type PackageRow,
  type PackageStatus,
  type PackageBadgeColor,
  type PackageError,
  type CreatePackageInput,
  type UpdatePackageInput,
} from './admin'
