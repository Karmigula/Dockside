# ECS Architecture Skill

Use this skill to enforce strict sim-ecs architecture.

## Rules

- Components are data-only classes.
- Systems contain all behavior and mutations.
- React components never mutate ECS state directly.
- Route mutations through store/action pipelines.

## Templates

- Component template with typed constructor args.
- System template using `createSystem`, `queryComponents`, `Read`, and `Write`.
- World scheduling template with deterministic stage ordering.

## Anti-Patterns

- Methods inside component classes.
- Business logic inside React component bodies.
- Global mutable module state for system internals.
