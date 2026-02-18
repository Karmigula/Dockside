# Social Graph Skill

Use this skill to implement and test relationship-network behavior.

## Core Patterns

- Directed weighted edges with explicit edge types.
- Deterministic traversal order for reproducible outcomes.
- First-, second-, and third-order ripple propagation.

## Implementation Notes

- Keep graph data in components/resources, not UI state.
- Encapsulate traversal in Systems.
- Produce event records for EventLog and debugging.

## Testing Notes

- Seed graph fixtures with known topologies.
- Assert ripple effects by hop depth.
- Include betrayal and informant edge-case scenarios.
