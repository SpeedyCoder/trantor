use serde::Deserialize;
use serde_json::json;
use tokio::sync::Mutex;

use crate::types::{AppSettings, LinearIssue, LinearIssuesResponse};

const LINEAR_GRAPHQL_URL: &str = "https://api.linear.app/graphql";
const LINEAR_ISSUE_LIMIT: usize = 50;

const ASSIGNED_ISSUES_QUERY: &str = r#"
query TrantorAssignedIssues($first: Int!) {
  viewer {
    assignedIssues(
      first: $first
      orderBy: updatedAt
    ) {
      nodes {
        id
        identifier
        title
        description
        url
        branchName
        updatedAt
        state { name type color }
        team { key }
      }
    }
  }
}
"#;

const ASSIGNED_ISSUES_COMPAT_QUERY: &str = r#"
query TrantorAssignedIssuesCompat($first: Int!) {
  viewer {
    assignedIssues(
      first: $first
      orderBy: updatedAt
    ) {
      nodes {
        id
        identifier
        title
        description
        url
        updatedAt
        state { name color }
        team { key }
      }
    }
  }
}
"#;

const ASSIGNED_ISSUES_NO_COLOR_COMPAT_QUERY: &str = r#"
query TrantorAssignedIssuesNoColorCompat($first: Int!) {
  viewer {
    assignedIssues(
      first: $first
      orderBy: updatedAt
    ) {
      nodes {
        id
        identifier
        title
        description
        url
        updatedAt
        state { name }
        team { key }
      }
    }
  }
}
"#;

#[derive(Debug, Deserialize)]
struct LinearGraphqlError {
    message: String,
}

#[derive(Debug, Deserialize)]
struct LinearGraphqlResponse {
    data: Option<LinearAssignedIssuesData>,
    errors: Option<Vec<LinearGraphqlError>>,
}

#[derive(Debug, Deserialize)]
struct LinearAssignedIssuesData {
    viewer: Option<LinearViewer>,
}

#[derive(Debug, Deserialize)]
struct LinearViewer {
    #[serde(rename = "assignedIssues")]
    assigned_issues: LinearIssueConnection,
}

#[derive(Debug, Deserialize)]
struct LinearIssueConnection {
    nodes: Vec<LinearIssueNode>,
}

#[derive(Debug, Deserialize)]
struct LinearIssueNode {
    id: String,
    identifier: String,
    title: String,
    description: Option<String>,
    url: String,
    #[serde(rename = "branchName")]
    branch_name: Option<String>,
    #[serde(rename = "updatedAt")]
    updated_at: String,
    state: Option<LinearIssueState>,
    team: Option<LinearIssueTeam>,
}

#[derive(Debug, Deserialize)]
struct LinearIssueState {
    name: String,
    #[serde(rename = "type")]
    state_type: Option<String>,
    color: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LinearIssueTeam {
    key: String,
}

impl From<LinearIssueNode> for LinearIssue {
    fn from(value: LinearIssueNode) -> Self {
        let branch_name = value
            .branch_name
            .as_deref()
            .map(str::trim)
            .filter(|branch| !branch.is_empty())
            .map(str::to_string)
            .or_else(|| fallback_branch_name(&value));
        Self {
            id: value.id,
            identifier: value.identifier,
            title: value.title,
            description: value.description,
            url: value.url,
            branch_name,
            updated_at: value.updated_at,
            state_name: value.state.as_ref().map(|state| state.name.clone()),
            state_color: value
                .state
                .and_then(|state| normalize_state_color(state.color.as_deref())),
            team_key: value.team.map(|team| team.key),
        }
    }
}

fn normalize_state_color(color: Option<&str>) -> Option<String> {
    let trimmed = color?.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.to_string())
}

fn normalize_token(token: Option<&String>) -> Result<String, String> {
    configured_token(token)
        .or_else(env_linear_token)
        .ok_or_else(|| "Linear API token is not configured.".to_string())
}

fn configured_token(token: Option<&String>) -> Option<String> {
    token
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn env_linear_token() -> Option<String> {
    std::env::var("LINEAR_API_KEY")
        .ok()
        .or_else(|| std::env::var("LINEAR_API_TOKEN").ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn authorization_header_value(token: &str) -> String {
    let trimmed = token.trim();
    if trimmed.to_ascii_lowercase().starts_with("bearer ") {
        trimmed.to_string()
    } else {
        trimmed.to_string()
    }
}

fn issue_matches_query(issue: &LinearIssue, query: &str) -> bool {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return true;
    }
    let needle = trimmed.to_lowercase();
    issue.identifier.to_lowercase().contains(&needle)
        || issue.title.to_lowercase().contains(&needle)
}

fn sanitize_branch_component(value: &str) -> String {
    let mut output = String::new();
    let mut last_was_separator = false;
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            output.push(ch.to_ascii_lowercase());
            last_was_separator = false;
        } else if !last_was_separator {
            output.push('-');
            last_was_separator = true;
        }
    }
    output.trim_matches('-').to_string()
}

fn fallback_branch_name(issue: &LinearIssueNode) -> Option<String> {
    let identifier = issue.identifier.trim();
    if identifier.is_empty() {
        return None;
    }
    let issue_id = identifier.to_ascii_lowercase();
    let title = sanitize_branch_component(&issue.title);
    if title.is_empty() {
        Some(issue_id)
    } else {
        Some(format!("{issue_id}-{title}"))
    }
}

fn is_open_issue(issue: &LinearIssueNode) -> bool {
    let Some(state_type) = issue
        .state
        .as_ref()
        .and_then(|state| state.state_type.as_deref())
    else {
        return true;
    };
    let normalized = state_type.to_ascii_lowercase();
    normalized != "completed" && normalized != "canceled"
}

fn linear_error_message(body: &[u8]) -> Option<String> {
    let response = serde_json::from_slice::<LinearGraphqlResponse>(body).ok()?;
    let errors = response.errors?;
    let message = errors
        .into_iter()
        .map(|error| error.message)
        .filter(|message| !message.trim().is_empty())
        .collect::<Vec<_>>()
        .join("; ");
    if message.is_empty() {
        None
    } else {
        Some(message)
    }
}

pub(crate) fn parse_linear_issues_response(
    body: &[u8],
    query: &str,
) -> Result<LinearIssuesResponse, String> {
    let response: LinearGraphqlResponse =
        serde_json::from_slice(body).map_err(|e| e.to_string())?;
    if let Some(errors) = response.errors {
        let message = errors
            .into_iter()
            .map(|error| error.message)
            .filter(|message| !message.trim().is_empty())
            .collect::<Vec<_>>()
            .join("; ");
        return Err(if message.is_empty() {
            "Linear API request failed.".to_string()
        } else {
            message
        });
    }

    let issues = response
        .data
        .and_then(|data| data.viewer)
        .map(|viewer| viewer.assigned_issues.nodes)
        .unwrap_or_default()
        .into_iter()
        .filter(is_open_issue)
        .map(LinearIssue::from)
        .filter(|issue| issue_matches_query(issue, query))
        .take(LINEAR_ISSUE_LIMIT)
        .collect::<Vec<_>>();

    Ok(LinearIssuesResponse {
        total: issues.len(),
        issues,
    })
}

fn should_retry_with_compat_query(message: &str) -> bool {
    let normalized = message.to_ascii_lowercase();
    normalized.contains("branchname")
        || normalized.contains("state")
        || normalized.contains("color")
}

fn should_retry_without_color(message: &str) -> bool {
    message.to_ascii_lowercase().contains("color")
}

async fn run_linear_query(
    client: &reqwest::Client,
    token: &str,
    query_text: &str,
    search_query: &str,
) -> Result<LinearIssuesResponse, String> {
    let body = json!({
        "query": query_text,
        "variables": {
            "first": LINEAR_ISSUE_LIMIT,
        },
    });
    let output = client
        .post(LINEAR_GRAPHQL_URL)
        .header(
            reqwest::header::AUTHORIZATION,
            authorization_header_value(token),
        )
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(body.to_string())
        .send()
        .await
        .map_err(|e| format!("Failed to call Linear API: {e}"))?;

    let status = output.status();
    let bytes = output
        .bytes()
        .await
        .map_err(|e| format!("Failed to read Linear API response: {e}"))?;
    if !status.is_success() {
        if let Some(message) = linear_error_message(&bytes) {
            return Err(message);
        }
        let detail = String::from_utf8_lossy(&bytes).trim().to_string();
        return Err(if detail.is_empty() {
            format!("Linear API request failed with status {status}.")
        } else {
            detail
        });
    }

    parse_linear_issues_response(&bytes, search_query)
}

pub(crate) async fn search_linear_issues_core(
    app_settings: &Mutex<AppSettings>,
    query: Option<String>,
) -> Result<LinearIssuesResponse, String> {
    let settings = app_settings.lock().await;
    let token = normalize_token(settings.linear_api_token.as_ref())?;
    drop(settings);

    let client = reqwest::Client::new();
    let search_query = query.as_deref().unwrap_or("");
    match run_linear_query(&client, &token, ASSIGNED_ISSUES_QUERY, search_query).await {
        Ok(response) => Ok(response),
        Err(error) if should_retry_with_compat_query(&error) => {
            match run_linear_query(&client, &token, ASSIGNED_ISSUES_COMPAT_QUERY, search_query)
                .await
            {
                Err(compat_error) if should_retry_without_color(&compat_error) => {
                    run_linear_query(
                        &client,
                        &token,
                        ASSIGNED_ISSUES_NO_COLOR_COMPAT_QUERY,
                        search_query,
                    )
                    .await
                }
                result => result,
            }
        }
        Err(error) => Err(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_linear_issues_response_maps_and_filters_issues() {
        let body = br##"{
          "data": {
            "viewer": {
              "assignedIssues": {
                "nodes": [
                  {
                    "id": "issue-1",
                    "identifier": "ENG-123",
                    "title": "Fix login",
                    "description": "Details",
                    "url": "https://linear.app/acme/issue/ENG-123/fix-login",
                    "branchName": "eng-123-fix-login",
                    "updatedAt": "2026-04-26T10:00:00.000Z",
                    "state": { "name": "Todo", "type": "unstarted", "color": "#1f80ff" },
                    "team": { "key": "ENG" }
                  },
                  {
                    "id": "issue-2",
                    "identifier": "OPS-9",
                    "title": "Update docs",
                    "description": null,
                    "url": "https://linear.app/acme/issue/OPS-9/update-docs",
                    "branchName": "ops-9-update-docs",
                    "updatedAt": "2026-04-25T10:00:00.000Z",
                    "state": { "name": "Backlog", "type": "backlog", "color": "#777777" },
                    "team": { "key": "OPS" }
                  }
                ]
              }
            }
          }
        }"##;

        let parsed = parse_linear_issues_response(body, "login").expect("parse response");

        assert_eq!(parsed.total, 1);
        assert_eq!(parsed.issues[0].identifier, "ENG-123");
        assert_eq!(
            parsed.issues[0].branch_name.as_deref(),
            Some("eng-123-fix-login")
        );
        assert_eq!(parsed.issues[0].state_name.as_deref(), Some("Todo"));
        assert_eq!(parsed.issues[0].state_color.as_deref(), Some("#1f80ff"));
        assert_eq!(parsed.issues[0].team_key.as_deref(), Some("ENG"));
    }

    #[test]
    fn parse_linear_issues_response_filters_completed_and_canceled_issues() {
        let body = br#"{
          "data": {
            "viewer": {
              "assignedIssues": {
                "nodes": [
                  {
                    "id": "issue-1",
                    "identifier": "ENG-1",
                    "title": "Open issue",
                    "description": null,
                    "url": "https://linear.app/acme/issue/ENG-1/open",
                    "branchName": "eng-1-open",
                    "updatedAt": "2026-04-26T10:00:00.000Z",
                    "state": { "name": "Todo", "type": "unstarted" },
                    "team": { "key": "ENG" }
                  },
                  {
                    "id": "issue-2",
                    "identifier": "ENG-2",
                    "title": "Done issue",
                    "description": null,
                    "url": "https://linear.app/acme/issue/ENG-2/done",
                    "branchName": "eng-2-done",
                    "updatedAt": "2026-04-25T10:00:00.000Z",
                    "state": { "name": "Done", "type": "completed" },
                    "team": { "key": "ENG" }
                  }
                ]
              }
            }
          }
        }"#;

        let parsed = parse_linear_issues_response(body, "").expect("parse response");

        assert_eq!(parsed.total, 1);
        assert_eq!(parsed.issues[0].identifier, "ENG-1");
    }

    #[test]
    fn parse_linear_issues_response_preserves_graphql_error_message() {
        let body = br#"{"errors":[{"message":"Authentication required"}]}"#;

        let error = parse_linear_issues_response(body, "").expect_err("expected error");

        assert_eq!(error, "Authentication required");
    }

    #[test]
    fn parse_linear_issues_response_generates_branch_name_when_missing() {
        let body = br#"{
          "data": {
            "viewer": {
              "assignedIssues": {
                "nodes": [
                  {
                    "id": "issue-1",
                    "identifier": "ENG-123",
                    "title": "Fix login flow",
                    "description": null,
                    "url": "https://linear.app/acme/issue/ENG-123/fix-login-flow",
                    "branchName": null,
                    "updatedAt": "2026-04-26T10:00:00.000Z",
                    "state": { "name": "Todo" },
                    "team": { "key": "ENG" }
                  }
                ]
              }
            }
          }
        }"#;

        let parsed = parse_linear_issues_response(body, "").expect("parse response");

        assert_eq!(
            parsed.issues[0].branch_name.as_deref(),
            Some("eng-123-fix-login-flow")
        );
    }

    #[test]
    fn should_retry_with_compat_query_for_schema_errors() {
        assert!(should_retry_with_compat_query(
            "Cannot query field \"branchName\" on type \"Issue\"."
        ));
        assert!(!should_retry_with_compat_query("Authentication required"));
    }

    #[test]
    fn authorization_header_value_uses_api_key_without_bearer_prefix() {
        assert_eq!(
            authorization_header_value(" lin_api_123 "),
            "lin_api_123".to_string()
        );
        assert_eq!(
            authorization_header_value("Bearer oauth-token"),
            "Bearer oauth-token".to_string()
        );
    }

    #[test]
    fn configured_token_rejects_missing_token() {
        assert!(configured_token(None).is_none());
    }
}
