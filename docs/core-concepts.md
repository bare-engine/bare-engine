---
title: Core Concepts
---

# Core Concepts

::: tip
This page is a starting outline. Each section can grow into its own page.
:::

## Scenes

A `Scene` owns game objects and has lifecycle methods such as `OnStart` and `OnUpdate`.

## Game objects

`GameObject` is the base for everything in a scene. Objects can have children (`AddChild`) and a transform (position, rotation, scale, pivot).

## Components

Behaviour that can be attached to objects, for example `AnimationComponent`, `ParticleComponent` and `TextComponent`.

## Prefabs

Reusable object definitions. An entity points to its prefab through `.extends`.

## Editor

The in-game level editor and the Chrome extension let you inspect and edit objects while the game runs.
