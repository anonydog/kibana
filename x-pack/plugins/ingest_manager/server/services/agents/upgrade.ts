/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { SavedObjectsClientContract } from 'src/core/server';
import { AgentSOAttributes, AgentAction, AgentActionSOAttributes } from '../../types';
import { AGENT_ACTION_SAVED_OBJECT_TYPE, AGENT_SAVED_OBJECT_TYPE } from '../../constants';
import { bulkCreateAgentActions, createAgentAction } from './actions';
import { getAgents, listAllAgents } from './crud';

export async function sendUpgradeAgentAction({
  soClient,
  agentId,
  version,
  sourceUri,
}: {
  soClient: SavedObjectsClientContract;
  agentId: string;
  version: string;
  sourceUri: string | undefined;
}) {
  const now = new Date().toISOString();
  const data = {
    version,
    source_uri: sourceUri,
  };
  await createAgentAction(soClient, {
    agent_id: agentId,
    created_at: now,
    data,
    ack_data: data,
    type: 'UPGRADE',
  });
  await soClient.update<AgentSOAttributes>(AGENT_SAVED_OBJECT_TYPE, agentId, {
    upgraded_at: undefined,
    upgrade_started_at: now,
  });
}

export async function ackAgentUpgraded(
  soClient: SavedObjectsClientContract,
  agentAction: AgentAction
) {
  const {
    attributes: { ack_data: ackData },
  } = await soClient.get<AgentActionSOAttributes>(AGENT_ACTION_SAVED_OBJECT_TYPE, agentAction.id);
  if (!ackData) throw new Error('data missing from UPGRADE action');
  const { version } = JSON.parse(ackData);
  if (!version) throw new Error('version missing from UPGRADE action');
  await soClient.update<AgentSOAttributes>(AGENT_SAVED_OBJECT_TYPE, agentAction.agent_id, {
    upgraded_at: new Date().toISOString(),
    upgrade_started_at: undefined,
  });
}

export async function sendUpgradeAgentsActions(
  soClient: SavedObjectsClientContract,
  options:
    | {
        agentIds: string[];
        sourceUri: string | undefined;
        version: string;
      }
    | {
        kuery: string;
        sourceUri: string | undefined;
        version: string;
      }
) {
  // Filter out agents currently unenrolling, agents unenrolled
  const agents =
    'agentIds' in options
      ? await getAgents(soClient, options.agentIds)
      : (
          await listAllAgents(soClient, {
            kuery: options.kuery,
            showInactive: false,
          })
        ).agents;
  const agentsToUpdate = agents.filter(
    (agent) => !agent.unenrollment_started_at && !agent.unenrolled_at
  );
  const now = new Date().toISOString();
  const data = {
    version: options.version,
    source_uri: options.sourceUri,
  };
  // Create upgrade action for each agent
  await bulkCreateAgentActions(
    soClient,
    agentsToUpdate.map((agent) => ({
      agent_id: agent.id,
      created_at: now,
      data,
      ack_data: data,
      type: 'UPGRADE',
    }))
  );

  return await soClient.bulkUpdate<AgentSOAttributes>(
    agentsToUpdate.map((agent) => ({
      type: AGENT_SAVED_OBJECT_TYPE,
      id: agent.id,
      attributes: {
        upgraded_at: undefined,
        upgrade_started_at: now,
      },
    }))
  );
}
