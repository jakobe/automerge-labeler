import * as core from "@actions/core";

async function run() {
  try {
    const label = core.getInput("label", { required: true });
    const order = core.getInput("order") as "first" | "last";
    const sortOrder = order === "first" ? "asc" : "desc";
    console.log(`Looking for pull request ${order} labelled by:`, label);
    const pullRequest = findPullRequest(label, sortOrder);
    if (pullRequest) {
      const output = JSON.stringify(pullRequest);
      console.log("Found pull request:", output);
      core.setOutput("pull_request", output);
    } else {
      console.log("No pull request found matching the label:", label);
    }
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
}

function findPullRequest(
  label: string,
  sortOrder?: "asc" | "desc"
): LabeledPullRequest {
  const payloadFromGraphQl = {
    data: {
      search: {
        issueCount: 1,
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
                      __typename: "LabeledEvent",
                      createdAt: "2020-03-23T15:45:54Z",
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
      const labelDateCreated = pr.node.timelineItems.edges
        .filter(labeledEvent => labeledEvent.node.label.name === "enhancement")
        .sort(sortByProperty(labeledEvent => labeledEvent.node.createdAt))
        .map(labeledEvent =>
          labeledEvent.node.__typename === "LabeledEvent"
            ? labeledEvent.node.createdAt
            : ""
        )[0];
      return {
        title: pr.node.title,
        url: pr.node.url,
        dateLabeled: labelDateCreated
      };
    })
    .filter(pr => !!pr.dateLabeled)
    .sort(sortByProperty(pr => pr.dateLabeled))[0];
  return nextUp;
}

type LabeledPullRequest = { title: string; url: string; dateLabeled: string };

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
  direction: "asc" | "desc" = "asc"
): (a: T, b: T) => number {
  return (a: T, b: T) => {
    return sortBy(getProperty, direction, a, b);
  };
}

run();
