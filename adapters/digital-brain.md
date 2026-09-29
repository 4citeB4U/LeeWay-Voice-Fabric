# Digital Brain Connector

The Digital Brain is a Harness consumer of Voice Fabric.

## Ownership

- Digital Brain owns context, navigation, project state and UI.
- Agent Lee owns presentation/conversation identity.
- Voice Fabric owns speech identity, queueing, synthesis, playback and interruption.
- Reasoning models produce candidate text; they do not own the voice.

## Startup presentation

```
brain renders
 -> glass Why LeeWay layer
 -> Voice Fabric prepare
 -> prepared narration streams to Voice One
 -> Brain continues deterministic initialization behind the glass
 -> narration completes
 -> glass dismisses
```

No reasoning model is required for the prepared opening narration.

## Conversation

Digital Brain should stream response text to Voice Fabric as phrases become available. Deterministic navigation may speak without invoking an LLM.
