# DataApi 设计指南

> 中文副本，对应英文原文：[docs/references/data/api-design-guidelines.md](../api-design-guidelines.md)。

定义 DataApi 路由、实体、DTO、错误、分页、排序和边界规则。

## 要点

- DataApi 只用于 SQLite-backed business data。
- 路由按 REST 风格表达资源。
- 复杂副作用命令应走 IpcApi 或专门服务。

## 阅读方式

本文保留原文中的代码块、命令、路径、配置键、API 名称和类型标识符；这些内容通常不翻译。阅读时可先看本中文副本把握设计意图，再回到英文原文核对完整细节。

## 原文结构

- `# API Design Guidelines`
- `## Path Naming`
- `## Resource ↔ Table Naming`
- `## HTTP Method Semantics`
- `## Standard Endpoint Patterns`
- `## Greedy Path Parameters`
- `## PATCH vs Dedicated Endpoints`
- `### Decision Criteria`
- `### Guidelines`
- `### Naming for Dedicated Endpoints`
- `### Examples`
- `## Non-CRUD Operations`
- `## Query Parameters`
- `## Response Status Codes`
- `### Success Status Constants`
- `### Handler Status Code Behavior`
- `## Error Response Format`
- `### SQLite Constraint Translation`
- `## Naming Conventions Summary`
- `## DataApi Scope & Boundaries`
- `### Eligibility Criteria`
- `### Hard Rule: No Non-Data Side Effects`
- `### Fenced Exception: Data Change Notification`
- `### Anti-patterns: What Does NOT Belong in DataApi`
