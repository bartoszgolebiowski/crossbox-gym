import assert from 'node:assert/strict';
import test from 'node:test';
import {
  IotMqttClient,
  LockerCommandPayload,
  LockerDeviceThing,
  LockerFacade,
  MqttFeedbackPayload,
  ScannerDeviceThing,
  ScannerFacade,
} from '../lib/handlers/shared/iot';

test('ScannerFacade publishes scanner feedback payloads', async () => {
  const feedbackCalls: string[] = [];
  const mqttClient: IotMqttClient = {
    publish: async (_topic, payload) => {
      const feedback = payload as MqttFeedbackPayload;
      feedbackCalls.push(`${feedback.entryId || 'none'}`);
    },
  };
  const facade = new ScannerFacade({
    deviceThing: new ScannerDeviceThing(mqttClient, 'gym/scanners/{thingName}/feedback'),
    audit: {
      recordDenied: async () => assert.fail('grant feedback path must not record denied audit'),
    },
  });

  await facade.feedback({
    scannerId: 'scanner-1',
    entryId: 'entry-1',
  });

  assert.deepEqual(feedbackCalls, ['entry-1']);
});

test('ScannerFacade publishes denial feedback and records denied audit', async () => {
  const denialCalls: string[] = [];
  const deniedAuditEvents: unknown[] = [];
  const mqttClient: IotMqttClient = {
    publish: async (topic, payload) => {
      const feedback = payload as MqttFeedbackPayload;
      denialCalls.push(`${topic}:${feedback.reason}`);
    },
  };

  const facade = new ScannerFacade({
    deviceThing: new ScannerDeviceThing(mqttClient, 'gym/scanners/{thingName}/feedback'),
    audit: {
      recordDenied: async (event) => {
        deniedAuditEvents.push(event);
      },
    },
  });
  const denied = await facade.reject('scanner-1', 'unavailable');

  assert.equal(denied.status, 'denied');
  assert.deepEqual(denialCalls, ['gym/scanners/scanner-1/feedback:unavailable']);
  assert.deepEqual(deniedAuditEvents, [
    {
      scannerId: 'scanner-1',
      reason: 'unavailable',
      locationId: undefined,
      lockerId: undefined,
    },
  ]);
});

test('LockerFacade does not audit an unlock command when MQTT publication fails', async () => {
  const auditEvents: unknown[] = [];
  const lockerDeviceThing: Pick<LockerDeviceThing, 'unlock'> = {
    unlock: async (): Promise<LockerCommandPayload> => {
      throw new Error('MQTT unavailable');
    },
  };
  const facade = new LockerFacade({
    deviceThing: lockerDeviceThing,
    audit: {
      recordUnlockCommandPublished: async (event) => {
        auditEvents.push(event);
      },
    },
  });

  await assert.rejects(
    () =>
      facade.unlock({
        lockerId: 'locker-1',
        scannerId: 'scanner-1',
        userId: 'member-1',
        entryId: 'entry-1',
        locationId: 'site-1',
      }),
    /MQTT unavailable/
  );
  assert.deepEqual(auditEvents, []);
});

test('LockerDeviceThing publishes Fail-Secure Inversion command (on=false, toggle_after=5.0, src)', async () => {
  let publishedTopic = '';
  let publishedPayload: unknown;

  const mockMqtt: IotMqttClient = {
    publish: async (topic, payload) => {
      publishedTopic = topic;
      publishedPayload = payload;
    },
  };

  const locker = new LockerDeviceThing(mockMqtt, 'gym/lockers/{thingName}/command');
  const result = await locker.unlock('crossbox-locker-relay-01', 'admin-session-123', 5.0);

  assert.equal(publishedTopic, 'gym/lockers/crossbox-locker-relay-01/command');
  assert.equal(result.method, 'Switch.Set');
  assert.equal(result.src, 'admin-session-123');
  assert.equal(result.params.id, 0);
  assert.equal(result.params.on, false); // Fail-Secure Inversion
  assert.equal(result.params.toggle_after, 5.0); // Required Gate 1
  assert.deepEqual(publishedPayload, result);
});
