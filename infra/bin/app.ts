#!/usr/bin/env node
import { App, Tags } from "aws-cdk-lib";
import { getConfig } from "../config/env.js";
import { NetworkStack } from "../lib/network-stack.js";
import { DataStack } from "../lib/data-stack.js";
import { AuthStack } from "../lib/auth-stack.js";
import { ComputeStack } from "../lib/compute-stack.js";

const app = new App();
const config = getConfig(app.node.tryGetContext("env"));
const env = { account: config.account, region: config.region };
const p = config.prefix;

// 프론트 도메인은 배포 후 Vercel 도메인으로 갱신(런북). 지금은 로컬+placeholder.
const callbackUrls = ["http://localhost:3000/api/auth/callback", `https://${config.prefix}.vercel.app/api/auth/callback`];
const logoutUrls = ["http://localhost:3000", `https://${config.prefix}.vercel.app`];

const network = new NetworkStack(app, `${p}-network`, { env, config });

const data = new DataStack(app, `${p}-data`, { env, config, vpc: network.vpc });

const auth = new AuthStack(app, `${p}-auth`, { env, config, callbackUrls, logoutUrls });

new ComputeStack(app, `${p}-compute`, {
  env,
  config,
  vpc: network.vpc,
  db: data.db,
  dbSecurityGroup: data.dbSecurityGroup,
  uploadsBucket: data.uploadsBucket,
  extractionQueue: data.extractionQueue,
  kmsKey: data.kmsKey,
  userPool: auth.userPool,
  userPoolClient: auth.userPoolClient,
});

Tags.of(app).add("project", "reportlens");
Tags.of(app).add("env", config.envName);
