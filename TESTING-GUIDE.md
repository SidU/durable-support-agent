# Durable Support Agent - Testing Guide

## Overview

This guide covers end-to-end testing of the Contoso Electronics support bot, verifying that order lookups, refund workflows, and supervisor approval/rejection all function correctly through the Teams DevTools UI and the Supervisor Dashboard.

## Prerequisites

Before testing, ensure all three services are running:

| Service | Port | Start Command |
|---------|------|---------------|
| Azurite (storage emulator) | 10000-10002 | `azurite --silent --location /tmp/azurite` |
| Azure Durable Functions | 7071 | `cd functions && npm run dev` |
| Teams Bot | 3978 | `npm run dev` |
| Supervisor Dashboard | 3000 | `cd dashboard && npm run dev` |

Bot DevTools URL: **http://localhost:3978** (redirects to devtools)
Dashboard URL: **http://localhost:3000**

## Test Data Reference

### Customers

| Name | Email | Tier |
|------|-------|------|
| Alice Johnson | alice@contoso.com | Gold |
| Bob Smith | bob@contoso.com | Silver |
| Carol Davis | carol@contoso.com | Bronze |
| Dave Wilson | dave@contoso.com | Gold |

### Orders

| Order ID | Customer | Items | Total | Status |
|----------|----------|-------|-------|--------|
| 4821 | Alice | Wireless Mouse + USB-C Hub | $79.98 | Delivered |
| 4822 | Bob | Mechanical Keyboard | $89.99 | Delivered |
| 4823 | Carol | 4K Monitor + Monitor Stand | $409.98 | Shipped |
| 4824 | Alice | Noise-Cancelling Headphones | $149.99 | Processing |
| 4825 | Dave | Webcam Pro x2 | $139.98 | Delivered |

---

## Test Scenarios

### Test 1: Order Lookup (Basic)

**Goal:** Verify the bot can look up orders and return correct details.

**Steps (in DevTools chat):**
1. Send: `Can you look up order 4821?`
2. Verify the bot returns correct details: Alice Johnson, Wireless Mouse + USB-C Hub, $79.98, delivered.

**Expected:** Bot calls `lookup_order` tool and presents order details conversationally.

---

### Test 2: Customer Lookup

**Goal:** Verify customer profile lookup works.

**Steps:**
1. Send: `Can you look up the customer alice@contoso.com?`
2. Verify: Name (Alice Johnson), tier (Gold), member since 2023.

**Expected:** Bot calls `lookup_customer` and returns profile info.

---

### Test 3: Knowledge Base Search

**Goal:** Verify KB search returns relevant policy articles.

**Steps:**
1. Send: `What is your return policy?`
2. Verify: Bot returns info about the 30-day return policy, original packaging requirement, 5-7 business day processing.

**Expected:** Bot calls `search_knowledge_base` and summarizes the relevant article.

---

### Test 4: Refund Request - Approved

**Goal:** Full end-to-end refund workflow with supervisor approval.

**Steps (in DevTools chat):**
1. Send: `I'd like a refund for order 4821. The mouse stopped working. My email is alice@contoso.com`
2. Bot should create a refund case and respond with a case ID (e.g., `case-xxxxxxxx`)
3. Bot should mention the refund is pending supervisor approval
4. **Note the case ID** from the response

**Steps (in Dashboard - separate browser window at localhost:3000):**
5. Verify the case appears in the pending cases table (may take up to 5 seconds to poll)
6. Confirm details: correct order ID (4821), action (refund), amount, customer email
7. Click **Approve**
8. Case should disappear from the table

**Steps (back in DevTools chat):**
9. Wait a few seconds - the bot should send a proactive notification confirming the refund was approved and processed

**Expected:** Complete flow from request -> pending -> approved -> notification.

---

### Test 5: Refund Request - Rejected

**Goal:** Verify rejection workflow works and customer is notified.

**Steps (in DevTools chat):**
1. Send: `I want a refund on order 4822 for $89.99. The keyboard is fine, I just don't want it anymore. My email is bob@contoso.com`
2. Note the case ID from the response

**Steps (in Dashboard):**
3. Find the case in the pending table
4. Click **Reject**
5. Case should disappear from the table

**Steps (back in DevTools chat):**
6. Bot should send a proactive message that the refund was rejected

**Expected:** Complete rejection flow with customer notification.

---

### Test 6: Case Status Check

**Goal:** Verify case status lookup works.

**Steps:**
1. After creating a case from Test 4 or 5, send: `Can you check the status of case case-xxxxxxxx?` (use actual case ID)
2. Verify bot returns the current status (approved/rejected/completed)

**Expected:** Bot calls `check_case_status` and returns case details.

---

### Test 7: Escalation to Human

**Goal:** Verify escalation workflow creates a case and shows in dashboard.

**Steps (in DevTools chat):**
1. Send: `I have a billing issue that's very complex - I've been double-charged on three orders and need someone to look into this urgently`
2. Bot should create an escalation case (not a refund)
3. Note the case ID

**Steps (in Dashboard):**
4. Verify the escalation case appears with action type "escalation"
5. Approve or reject the escalation
6. Verify the bot sends a proactive notification

**Expected:** Escalation cases appear in the same dashboard and follow the same approval workflow.

---

### Test 8: Edge Cases

**Goal:** Verify error handling for invalid inputs.

**Steps:**
1. Send: `Look up order 9999` - should return "order not found" type message
2. Send: `Look up customer nobody@example.com` - should return "customer not found"
3. Send: `Check case status for case-doesnotexist` - should return "case not found"

**Expected:** Bot handles errors gracefully without crashing.

---

## Dashboard Verification Checklist

When checking the dashboard at `http://localhost:3000`:

- [ ] Page loads with "Support Case Dashboard" heading
- [ ] Table shows pending cases with all columns (Case ID, Customer, Order, Action, Amount, Description, Created, Actions)
- [ ] Approve button works and removes case from list
- [ ] Reject button works and removes case from list
- [ ] New cases appear within 5 seconds (polling interval)
- [ ] "No pending cases" message shows when table is empty
- [ ] Buttons are disabled while an action is in progress (preventing double-clicks)

---

## Key Verification Points

1. **Cosmos DB persistence**: Cases are saved before orchestration starts
2. **Durable orchestration**: The `waitForExternalEvent` pauses the workflow at zero cost
3. **Dashboard polling**: Cases appear in the dashboard within the 5-second poll interval
4. **Proactive notifications**: Bot sends a message back to the user after approval/rejection
5. **Refund processing**: On approval, the `issueRefund` activity is called before completion
