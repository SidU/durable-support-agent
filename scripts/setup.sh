#!/usr/bin/env bash
set -euo pipefail

# ─── Defaults ────────────────────────────────────────────────────────────────
DEFAULT_RG="${AZURE_COSMOS_RG:-support-agent-rg}"
DEFAULT_LOCATION="${AZURE_COSMOS_LOCATION:-eastus}"
DEFAULT_ACCOUNT="${AZURE_COSMOS_ACCOUNT:-support-agent-cosmos-$(whoami)}"
DB_NAME="support-agent"
CONTAINER_NAME="cases"

# ─── Parsed values ───────────────────────────────────────────────────────────
RG="$DEFAULT_RG"
LOCATION="$DEFAULT_LOCATION"
ACCOUNT="$DEFAULT_ACCOUNT"
DELETE=false

# ─── Usage ───────────────────────────────────────────────────────────────────
usage() {
    cat <<EOF
Usage: $(basename "$0") [options]

Provision an Azure Cosmos DB resource for the durable support agent sample.

Options:
  -g, --resource-group NAME   Resource group name          (default: $DEFAULT_RG)
  -l, --location LOCATION     Azure region                 (default: $DEFAULT_LOCATION)
  -n, --name NAME             Cosmos DB account name       (default: $DEFAULT_ACCOUNT)
      --delete                Tear down the resource group
  -h, --help                  Show this help message

Environment variables:
  AZURE_COSMOS_RG             Override default resource group
  AZURE_COSMOS_LOCATION       Override default location
  AZURE_COSMOS_ACCOUNT        Override default account name
EOF
}

# ─── Parse arguments ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        -g|--resource-group) RG="$2"; shift 2 ;;
        -l|--location)       LOCATION="$2"; shift 2 ;;
        -n|--name)           ACCOUNT="$2"; shift 2 ;;
        --delete)            DELETE=true; shift ;;
        -h|--help)           usage; exit 0 ;;
        *)                   echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
    esac
done

# ─── Helpers ─────────────────────────────────────────────────────────────────
info()  { echo "==> $*"; }
error() { echo "ERROR: $*" >&2; exit 1; }

# ─── Prerequisites ───────────────────────────────────────────────────────────
check_prerequisites() {
    info "Checking prerequisites..."

    if ! command -v az &>/dev/null; then
        error "Azure CLI (az) is not installed. Install it from https://aka.ms/install-azure-cli"
    fi

    if ! az account show &>/dev/null; then
        error "Not logged in to Azure. Run 'az login' first."
    fi

    local sub
    sub=$(az account show --query '{name:name, id:id}' -o tsv)
    info "Active subscription: $sub"
}

# ─── Teardown ────────────────────────────────────────────────────────────────
delete_resources() {
    info "This will delete resource group '$RG' and ALL resources in it."
    read -r -p "Are you sure? (y/N): " confirm
    if [[ "$confirm" != [yY] ]]; then
        echo "Aborted."
        exit 0
    fi
    info "Deleting resource group '$RG'..."
    az group delete --name "$RG" --yes --no-wait
    info "Deletion initiated (running in background). Check the Azure portal for status."
}

# ─── Create resource group ───────────────────────────────────────────────────
create_resource_group() {
    info "Creating resource group '$RG' in '$LOCATION'..."
    az group create --name "$RG" --location "$LOCATION" -o none
}

# ─── Create Cosmos DB account ────────────────────────────────────────────────
create_cosmos_account() {
    if az cosmosdb show --name "$ACCOUNT" --resource-group "$RG" &>/dev/null; then
        info "Cosmos DB account '$ACCOUNT' already exists — skipping creation."
    else
        info "Creating Cosmos DB account '$ACCOUNT' (serverless)..."
        az cosmosdb create \
            --name "$ACCOUNT" \
            --resource-group "$RG" \
            --capabilities EnableServerless \
            -o none
    fi
}

# ─── Create database and container ───────────────────────────────────────────
create_database_and_container() {
    info "Creating database '$DB_NAME'..."
    az cosmosdb sql database create \
        --account-name "$ACCOUNT" \
        --resource-group "$RG" \
        --name "$DB_NAME" \
        -o none 2>/dev/null || info "Database already exists."

    info "Creating container '$CONTAINER_NAME' (partition key: /id)..."
    az cosmosdb sql container create \
        --account-name "$ACCOUNT" \
        --resource-group "$RG" \
        --database-name "$DB_NAME" \
        --name "$CONTAINER_NAME" \
        --partition-key-path "/id" \
        -o none 2>/dev/null || info "Container already exists."
}

# ─── Get connection string ───────────────────────────────────────────────────
get_connection_string() {
    info "Retrieving connection string..."
    COSMOS_CONNECTION_STRING=$(az cosmosdb keys list \
        --name "$ACCOUNT" \
        --resource-group "$RG" \
        --type connection-strings \
        --query 'connectionStrings[0].connectionString' \
        -o tsv)
    export COSMOS_CONNECTION_STRING
}

# ─── Print summary ───────────────────────────────────────────────────────────
print_summary() {
    cat <<EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Setup complete!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Resource group  : $RG
  Location        : $LOCATION
  Cosmos account  : $ACCOUNT
  Database        : $DB_NAME
  Container       : $CONTAINER_NAME
  Connection str  : ${COSMOS_CONNECTION_STRING:0:60}...

  Add the connection string to your .env files:

    # In Samples/durable-support-agent/.env
    COSMOS_CONNECTION_STRING='$COSMOS_CONNECTION_STRING'

    # In Samples/durable-support-agent/functions/local.settings.json
    # Set COSMOS_CONNECTION_STRING in Values

    # In Samples/durable-support-agent/dashboard/.env.local
    COSMOS_CONNECTION_STRING='$COSMOS_CONNECTION_STRING'

  Then start the services (see README for full instructions):

    # Terminal 1: Azurite (storage emulator for Durable Functions)
    azurite --silent --location /tmp/azurite

    # Terminal 2: Durable Functions
    cd functions && npm install && npm run dev

    # Terminal 3: Teams Bot
    npm install && npm run dev

    # Terminal 4: Supervisor Dashboard
    cd dashboard && npm install && npm run dev

  To tear down all resources:

    ./scripts/setup.sh --delete

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
}

# ─── Main ────────────────────────────────────────────────────────────────────
check_prerequisites

if [[ "$DELETE" == true ]]; then
    delete_resources
    exit 0
fi

create_resource_group
create_cosmos_account
create_database_and_container
get_connection_string
print_summary
