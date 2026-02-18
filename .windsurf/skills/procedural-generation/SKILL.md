# Procedural Generation Skill

Use this skill for deterministic Warsim-style content generation.

## Guidance

- Build combinatorial generators from small, typed tables.
- Use seeded randomness for repeatable test outcomes.
- Keep generated outputs serializable and schema-validated.

## Data Packs

- Faction ethos tables.
- Economic focus tables.
- Quirk trait tables.
- Detroit 1986 naming and location fixtures.

## Output Contracts

- Emit `as const` static data where possible.
- Provide fixture builders for tests.
- Include min/max distributions for balance tuning.
