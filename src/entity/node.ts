import { AppDataSource } from '#config/data-source'
import { errLog } from '#helpers/logger'
import { dateTimeType } from '#helpers/migration-helper'
import { parseProtobuf } from '#helpers/utils'
import { DateTime } from 'luxon'
import { BeforeInsert, BeforeUpdate, Column, Entity, EntityManager } from 'typeorm'
import { meshtastic } from '../gen/meshtastic-protobufs.js'
import { BaseTypeWithoutPrimaryKey, BaseType } from './base_type.js'
import DeviceMetric from './device_metric.js'
import EnvironmentMetric from './environment_metric.js'
import MapReport from './map_report.js'
import { MessageIn, MessageOut, Neighbors } from './neighbors.js'
import NeighbourInfo from './neighbour_info.js'
import Position from './position.js'
import TextMessage from './text_message.js'

@Entity()
export default class Node extends BaseTypeWithoutPrimaryKey {
  @Column({ type: 'bigint', unique: true, primary: true })
  nodeId: number

  @Column({ type: 'text', nullable: true })
  longName?: string

  @Column({ type: 'text', nullable: true })
  shortName?: string

  @Column({ type: 'integer', nullable: true })
  hardwareModel?: number

  @Column({ type: 'boolean', nullable: true })
  isLicensed?: boolean

  @Column({ type: 'integer', nullable: true })
  role?: number

  @Column({ type: 'integer', nullable: true })
  altitude?: number

  @Column({ type: 'integer', nullable: true })
  latitude?: number

  @Column({ type: 'integer', nullable: true })
  longitude?: number

  @Column({ type: 'double precision', nullable: true })
  airUtilTx?: number

  @Column({ type: 'integer', nullable: true })
  batteryLevel?: number

  @Column({ type: 'double precision', nullable: true })
  channelUtilization?: number

  @Column({ type: 'double precision', nullable: true })
  voltage?: number

  @Column({ type: 'integer', nullable: true })
  neighbourBroadcastIntervalSecs?: number

  @Column({ type: 'json', nullable: true })
  neighbours?: Neighbors[]

  @Column({ type: 'json', nullable: true })
  outbox?: MessageOut[]

  @Column({ type: 'json', nullable: true })
  inbox?: MessageIn[]

  @Column({ type: dateTimeType(), nullable: true })
  neighboursUpdatedAt?: Date

  @Column({ type: dateTimeType(), nullable: true })
  positionUpdatedAt?: Date

  @Column({ type: 'text', nullable: true })
  mqttConnectionState?: string

  @Column({ type: dateTimeType(), nullable: true })
  mqttConnectionStateUpdatedAt?: Date

  @Column({ type: 'text', nullable: true })
  firmwareVersion?: string

  @Column({ type: 'boolean', nullable: true })
  hasDefaultChannel?: boolean

  @Column({ type: 'integer', nullable: true })
  modemPreset?: number

  @Column({ type: 'integer', nullable: true })
  numOnlineLocalNodes?: number

  @Column({ type: 'integer', nullable: true })
  positionPrecision?: number

  @Column({ type: 'integer', nullable: true })
  region?: number

  @Column({ type: 'bigint', nullable: true })
  uptimeSeconds?: number

  @Column({ type: 'double precision', nullable: true })
  barometricPressure?: number

  @Column({ type: 'double precision', nullable: true })
  relativeHumidity?: number

  @Column({ type: 'double precision', nullable: true })
  temperature?: number

  private static conflictResolve = {
    skipUpdateIfNoValuesChanged: true,
    conflictPaths: ['nodeId'],
  }

  @BeforeInsert()
  @BeforeUpdate()
  purgeTextMessages() {
    const purgeDataOlderThan = BaseType.purgeDataOlderThan
    if (!purgeDataOlderThan) {
      return
    }

    const now = DateTime.now()

    this.inbox = this.inbox?.filter((msg) => {
      return now.diff(DateTime.fromISO(msg.time)) < purgeDataOlderThan
    })

    this.outbox = this.outbox?.filter((msg) => {
      return now.diff(DateTime.fromISO(msg.time)) < purgeDataOlderThan
    })
  }

  static fromPacket(envelope: meshtastic.ServiceEnvelope) {
    const packet = envelope.packet
    const payload = packet?.decoded?.payload

    if (!payload) {
      return
    }

    const user = parseProtobuf(() => meshtastic.User.decode(payload))

    try {
      const entity = AppDataSource.manager.merge(Node, new Node(), {
        nodeId: packet.from!,
        longName: user.longName!,
        shortName: user.shortName!,
        hardwareModel: user.hwModel!,
        isLicensed: user.isLicensed!,
        role: user.role!,
      })

      this.decodeLogger(`Decoded ${this.name}`, entity, user, envelope)
      return entity
    } catch (e) {
      errLog(`Unable to create node`, { err: e, user, envelope })
    }
  }

  static async updateDeviceMetrics(trx: EntityManager, dm: DeviceMetric) {
    return trx.getRepository(Node).upsert(
      {
        nodeId: dm.nodeId,
        batteryLevel: dm.batteryLevel,
        voltage: dm.voltage,
        airUtilTx: dm.airUtilTx,
        channelUtilization: dm.channelUtilization,
        uptimeSeconds: dm.uptimeSeconds,
      },
      this.conflictResolve
    )
  }

  static async updateEnvironmentMetrics(trx: EntityManager, em: EnvironmentMetric) {
    return trx.getRepository(Node).upsert(
      {
        nodeId: em.nodeId,
        barometricPressure: em.barometricPressure,
        relativeHumidity: em.relativeHumidity,
        temperature: em.temperature,
        voltage: em.voltage,
      },
      this.conflictResolve
    )
  }

  static updateMapReports(trx: EntityManager, mr: MapReport) {
    return trx.getRepository(Node).upsert(
      {
        nodeId: mr.nodeId,
        shortName: mr.shortName,
        longName: mr.longName,
        role: mr.role,
        latitude: mr.latitude,
        longitude: mr.longitude,
        altitude: BaseType.sanitizeNumber(mr.altitude),
        firmwareVersion: mr.firmwareVersion,
        region: mr.region,
        modemPreset: mr.modemPreset,
        hasDefaultChannel: mr.hasDefaultChannel,
        positionPrecision: mr.positionPrecision,
        numOnlineLocalNodes: mr.numOnlineLocalNodes,
        positionUpdatedAt: new Date(),
      },
      this.conflictResolve
    )
  }

  static async updateMqttStatus(trx: EntityManager, nodeId: number, mqttConnectionState: string, mqttConnectionStateUpdatedAt: Date) {
    return trx.getRepository(Node).upsert(
      {
        nodeId,
        mqttConnectionState,
        mqttConnectionStateUpdatedAt,
      },
      this.conflictResolve
    )
  }

  static async updatePosition(trx: EntityManager, position: Position) {
    return trx.getRepository(Node).upsert(
      {
        nodeId: position.from,
        positionUpdatedAt: new Date(),
        latitude: BaseType.sanitizeNumber(position.latitude), // unlikely that lat/lon/alt are exactly `0`
        longitude: BaseType.sanitizeNumber(position.longitude),
        altitude: BaseType.sanitizeNumber(position.altitude),
      },
      this.conflictResolve
    )
  }

  static updateNeighbors(trx: EntityManager, neighborInfo: NeighbourInfo) {
    return trx
      .getRepository(Node)
      .upsert({ nodeId: neighborInfo.nodeId, neighbours: neighborInfo.neighbours, neighboursUpdatedAt: new Date() }, this.conflictResolve)
  }

  inboundMessage(tm: TextMessage) {
    this.inbox ||= []
    this.inbox.unshift({ from: tm.from, text: tm.text, time: this.now() })
  }

  outboundMessage(tm: TextMessage) {
    this.outbox ||= []
    this.outbox.unshift({ to: tm.to, text: tm.text, time: this.now() })
  }

  static async hardwareModels(mgr: EntityManager) {
    return (
      (await mgr.query('select hardware_model as hardwareModel, count(hardware_model) as count from nodes group by hardware_model')) || []
    )
  }
  static async createOrUpdate(trx: EntityManager, newNode: Node) {
    return trx.getRepository(Node).upsert(newNode, {
      skipUpdateIfNoValuesChanged: true,
      conflictPaths: ['nodeId'],
    })
  }

  now() {
    return new Date().toJSON()
  }
}
