import * as core from "@actions/core";

import { Octokit } from "@octokit/action";

async function run() {
  try {
    const label = core.getInput("label", { required: true });
    const order = core.getInput("order") as "first" | "last";
    const sortOrder = order === "first" ? "asc" : "desc";
    core.info(
      `Looking for approved pull request ${order} labelled by: [${label}]`
    );
    const data = await getPullRequestsWithLabels();
    core.info(`data from graphQl: ${data}`);
    const pullRequest = findPullRequest(label, sortOrder);
    if (pullRequest) {
      const output = JSON.stringify(pullRequest);
      core.info(`Found pull request:\n'${output}'`);
      core.setOutput("pull_request", output);
    } else {
      core.info(
        `No approved pull request(s) found matching the label: [${label}]`
      );
    }
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
}

async function getPullRequestsWithLabels() {
  const octokit = new Octokit();
  const repo = process?.env?.GITHUB_REPOSITORY;
  core.info(`repo: ${repo}`);
  const result = await octokit.graphql(
    `query getApprovedPullRequestsWithLabels($query:String!) {
    search(query: $query, type: ISSUE, first: 100) {
      issueCount
       edges {
        node {
          ... on PullRequest {
            title
            url
            number
            state
            timelineItems(last: 100, itemTypes: [LABELED_EVENT, UNLABELED_EVENT]) {
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
                  ... on UnlabeledEvent {
                    createdAt
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
    { query: `repo:${repo} is:pr is:open review:approved'` }
  );
  core.info(`query result: ${JSON.stringify(result)}`);
  return result;
}

function findPullRequest(
  label: string,
  sortOrder: "asc" | "desc"
): LabeledPullRequest {
  const payloadFromGraphQl = {
    data: {
      search: {
        issueCount: 2,
        edges: [
          {
            node: {
              title: "Update main.yml",
              url: "https://github.com/jakobe/github-actions-test/pull/1",
              number: 1,
              state: "OPEN",
              timelineItems: {
                edges: [
                  {
                    node: {
                      __typename: "UnlabeledEvent",
                      createdAt: "2020-03-22T15:45:54Z",
                      label: {
                        name: "merge:ready"
                      }
                    }
                  },
                  {
                    node: {
                      __typename: "LabeledEvent",
                      createdAt: "2020-03-23T15:45:54Z",
                      actor: {
                        login: "hafstad"
                      },
                      label: {
                        name: "merge:ready"
                      }
                    }
                  }
                ]
              }
            }
          },
          {
            node: {
              title: "2 - Update main.yml",
              url: "https://github.com/jakobe/github-actions-test/pull/2",
              number: 2,
              state: "OPEN",
              timelineItems: {
                edges: [
                  {
                    node: {
                      __typename: "LabeledEvent",
                      createdAt: "2020-04-23T15:45:54Z",
                      actor: {
                        login: "jakobe"
                      },
                      label: {
                        name: "merge:ready"
                      }
                    }
                  }
                ]
              }
            }
          }
        ]
      }
    }
  };
  const nextUp = payloadFromGraphQl.data.search.edges
    .map(pr => {
      const matchingLabels = pr.node.timelineItems.edges
        .filter(labeledEvent => labeledEvent.node.label.name === label)
        // Order by latest applied:
        .sort(
          sortByProperty(labeledEvent => labeledEvent.node.createdAt, "desc")
        )
        .map(
          labeledEvent =>
            labeledEvent.node.__typename === "LabeledEvent"
              ? {
                  name: labeledEvent.node.label.name,
                  createdAt: labeledEvent.node.createdAt,
                  createdBy: labeledEvent.node.actor?.login
                }
              : undefined //Return UnlabeledEvent as undefined
        );
      const latestLabel = matchingLabels[0];
      return {
        title: pr.node.title,
        url: pr.node.url,
        label: latestLabel
      };
    })
    .filter(pr => !!pr.label)
    .sort(sortByProperty(pr => pr.label!.createdAt, sortOrder))[0];
  return nextUp;
}

type Label = { name: string; createdAt: string };
type LabeledPullRequest = { title: string; url: string; label?: Label };

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

run();
