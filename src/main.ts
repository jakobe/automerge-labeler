import * as core from "@actions/core";

async function run() {
  try {
    const label = core.getInput("label", { required: true });
    const order = core.getInput("order") as "first" | "last";
    const sortOrder = order === "first" ? "asc" : "desc";
    console.log(
      `Looking for approved pull request ${order} labelled by: [${label}]`
    );
    const pullRequest = findPullRequest(label, sortOrder);
    if (pullRequest) {
      const output = JSON.stringify(pullRequest);
      console.log("Found pull request:", output);
      core.setOutput("pull_request", output);
    } else {
      console.log(
        `No approved pull request(s) found matching the label: [${label}]`
      );
    }
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
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
