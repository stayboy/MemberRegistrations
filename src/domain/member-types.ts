/** Shared member vocabulary; a leaf module so DTO schemas do not import a repository. */

export const GENDERS = ['male', 'female', 'other', 'undisclosed'] as const;
export type Gender = (typeof GENDERS)[number];

export const RELATIONSHIP_TYPES = ['spouse', 'parent', 'child', 'guardian', 'other'] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];
