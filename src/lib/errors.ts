export class AppError extends Error {
  public readonly code: string;

  constructor(message: string, code: string, cause?: unknown) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class TaskError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, "TASK_ERROR", cause);
  }
}

export class AgentError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, "AGENT_ERROR", cause);
  }
}

export class GitError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, "GIT_ERROR", cause);
  }
}

export class DeployError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, "DEPLOY_ERROR", cause);
  }
}
