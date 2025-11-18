# How to Check and Fix Templates

## Problem

When sending `["EMAIL", "PUSH"]`, only PUSH is being queued. This means the EMAIL template lookup is failing.

## Root Cause

The template in the database likely has `channel: [PUSH]` only, not `channel: [EMAIL, PUSH]`.

## Solution

### Option 1: Check Existing Template

Query your template-service to see what templates exist:

```bash
# Get all templates
GET http://localhost:3003/template?page=1&limit=100
Authorization: Bearer <ADMIN_JWT_TOKEN>

# Or check specific template
GET http://localhost:3003/template/event/WELCOME_MESSAGE/EMAIL?language=en
Authorization: Bearer <ADMIN_JWT_TOKEN>

GET http://localhost:3003/template/event/WELCOME_MESSAGE/PUSH?language=en
Authorization: Bearer <ADMIN_JWT_TOKEN>
```

### Option 2: Update Template to Include Both Channels

If your template has `channel: [PUSH]` only, update it to include EMAIL:

```bash
PATCH http://localhost:3003/template/<template-id>
Authorization: Bearer <ADMIN_JWT_TOKEN>
Content-Type: application/json

{
  "channel": ["EMAIL", "PUSH"]
}
```

### Option 3: Create Separate Templates

You can also create separate templates:

- One with `channel: [EMAIL]` for email notifications
- One with `channel: [PUSH]` for push notifications
- Or one with `channel: [EMAIL, PUSH]` for both

## How Template Lookup Works

When you request a template for `EMAIL`:

1. Query: `channel: { hasSome: [EMAIL] }`
2. This finds templates where the channel array **contains** EMAIL
3. If template has `channel: [PUSH]` → won't match
4. If template has `channel: [EMAIL]` → will match ✅
5. If template has `channel: [EMAIL, PUSH]` → will match ✅

## Quick Fix

If you have a template with ID `<template-id>`, update it:

```bash
PATCH http://localhost:3003/template/<template-id>
Authorization: Bearer <ADMIN_JWT_TOKEN>

{
  "channel": ["EMAIL", "PUSH"]
}
```

This will allow the template to be used for both EMAIL and PUSH notifications.
