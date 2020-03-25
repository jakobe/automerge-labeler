import * as core from "@actions/core";

import { Octokit } from "@octokit/action";

async function run() {
  try {
    const repo = process?.env?.GITHUB_REPOSITORY;
    if (!repo) {
      core.info(`'env.GITHUB_REPOSITORY' not found - exiting...`);
      return;
    }
    const mergeCandidateLabel = core.getInput("label-candidate", {
      required: true
    });
    const automergeLabel = core.getInput("label-automerge");
    const order = core.getInput("order") as "first" | "last";
    const sortOrder = order === "first" ? "asc" : "desc";
    core.info(
      `Looking for approved pull request ${order} labelled by: [${mergeCandidateLabel}]`
    );
    const candidatePullRequest = await findPullRequest(
      repo,
      mergeCandidateLabel,
      sortOrder,
      "approved"
    );
    if (candidatePullRequest) {
      const candidatePullRequestJSON = toString(candidatePullRequest);
      core.info(
        `Found pull request candidate for automerge:\n'${candidatePullRequestJSON}'`
      );
      const existingAutomergePullRequest = await findPullRequest(
        repo,
        automergeLabel,
        "asc"
      );
      if (!existingAutomergePullRequest) {
        core.info(
          `No existing pull request(s) waiting to be automerged - applying [automerge] label on: [${candidatePullRequest.title}](${candidatePullRequest.url})`
        );
        core.setOutput("pull_request", candidatePullRequestJSON);
        const [owner, reponame] = repo.split("/");
        await addLabel(
          owner,
          reponame,
          candidatePullRequest.number,
          automergeLabel
        );
      } else {
        core.info(
          `Not applying [automerge] label - existing pull request waiting to be automerged: ${toString(
            existingAutomergePullRequest
          )}`
        );
      }
    } else {
      core.info(
        `No approved pull request(s) found matching the label: [${mergeCandidateLabel}]`
      );
    }
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
}

async function addLabel(
  owner: string,
  repo: string,
  prNumber: number,
  label: string
) {
  const params = {
    owner: owner,
    repo: repo,
    issue_number: prNumber,
    labels: [label]
  };
  core.info(`Adding label: ${toString(params)}`);
  const octokit = new Octokit();
  await octokit.issues.addLabels(params);
}

async function getPullRequestsWithLabel(
  repo: string,
  label: string,
  reviewDecision?: "approved"
): Promise<GraphQLSearchResult> {
  const octokit = new Octokit();
  const reviewFilter = reviewDecision ? " review:approved" : "";
  const result = await octokit
    .graphql({
      query: `query getMergeReadyPRs($query_exp:String!) {
      search(query: $query_exp, type: ISSUE, first: 100) {
        issueCount
         edges {
          node {
            ... on PullRequest {
              title
              url
              number
              timelineItems(last: 100, itemTypes: [LABELED_EVENT]) {
                edges {
                  node {
                    __typename
                    ... on LabeledEvent {
                      createdAt
                      actor {
                        login
                      }
                      label {
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
  }`,
      query_exp: `repo:${repo} is:pr is:open ${reviewFilter} label:${label}`
    })
    .catch(error => {
      core.error(JSON.stringify(error));
      core.setFailed(error.message);
    });

  core.info(
    `query result for label [${label}]${reviewFilter}: ${toString(result)}`
  );
  return result as GraphQLSearchResult;
}

async function findPullRequest(
  repo: string,
  label: string,
  sortOrder: "asc" | "desc",
  reviewDecision?: "approved"
): Promise<LabeledPullRequest> {
  const data = await getPullRequestsWithLabel(repo, label, reviewDecision);
  const firstMatchingPullRequest = data.search.edges
    .map(pr => {
      const matchingLabels = pr.node.timelineItems.edges
        .filter(labeledEvent => labeledEvent.node.label.name === label)
        // Order by latest applied:
        .sort(
          sortByProperty(labeledEvent => labeledEvent.node.createdAt, "desc")
        )
        .map(labeledEvent => {
          return {
            name: labeledEvent.node.label.name,
            createdAt: labeledEvent.node.createdAt,
            createdBy: labeledEvent.node.actor.login
          };
        });
      const latestLabel = matchingLabels[0];
      return {
        title: pr.node.title,
        number: pr.node.number,
        url: pr.node.url,
        label: latestLabel
      };
    })
    .sort(sortByProperty(pr => pr.label.createdAt, sortOrder))[0];
  return firstMatchingPullRequest;
}

type Label = { name: string; createdAt: string };
type LabeledPullRequest = {
  title: string;
  number: number;
  url: string;
  label?: Label;
};
type GraphQLSearchResult = {
  search: {
    issueCount: number;
    edges: [
      {
        node: {
          title: string;
          url: string;
          number: number;
          timelineItems: {
            edges: [
              {
                node: {
                  __typename: string;
                  createdAt: string;
                  actor: {
                    login: string;
                  };
                  label: {
                    name: string;
                  };
                };
              }
            ];
          };
        };
      }
    ];
  };
};

function sortBy<T>(
  getProperty: (obj: T) => string,
  direction: "asc" | "desc",
  a: T,
  b: T
): number {
  return direction === "asc"
    ? getProperty(a).localeCompare(getProperty(b))
    : getProperty(b).localeCompare(getProperty(a));
}

function sortByProperty<T>(
  getProperty: (obj: T) => string,
  direction: "asc" | "desc"
): (a: T, b: T) => number {
  return (a: T, b: T) => {
    return sortBy(getProperty, direction, a, b);
  };
}

function toString(value: any) {
  return JSON.stringify(value, null, 2);
}

run();
