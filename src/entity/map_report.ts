import { Data } from '@buf/meshtastic_protobufs.bufbuild_es/meshtastic/mesh_pb.js'
import { MapReport as MapReportProtobuf, ServiceEnvelope } from '@buf/meshtastic_protobufs.bufbuild_es/meshtastic/mqtt_pb.js'
import { Column, Entity } from 'typeorm'
import { AppDataSource } from '#config/data-source'
import { BaseType } from './base_type.js'
import { parseProtobuf } from '#helpers/utils'
import { errLog } from '#helpers/logger'

@Entity()
export default class MapReport extends BaseType {
  @Column({ type: 'bigint' })
  nodeId: number

  @Column({ type: 'text' })
  longName: string

  @Column({ type: 'text' })
  shortName: string

  @Column({ type: 'integer' })
  role: number

  @Column({ type: 'integer' })
  hardwareModel: number

  @Column({ type: 'text' })
  firmwareVersion: string

  @Column({ type: 'integer', nullable: true })
  region?: number

  @Column({ type: 'integer', nullable: true })
  modemPreset?: number

  @Column({ type: 'boolean', nullable: true })
  hasDefaultChannel?: boolean

  @Column({ type: 'integer', nullable: true })
  latitude?: number

  @Column({ type: 'integer', nullable: true })
  longitude?: number

  @Column({ type: 'integer', nullable: true })
  altitude?: number

  @Column({ type: 'integer', nullable: true })
  positionPrecision?: number

  @Column({ type: 'integer', nullable: true })
  numOnlineLocalNodes?: number

  static fromPacket(envelope: ServiceEnvelope) {
    const packet = envelope.packet!

    const mr = parseProtobuf(() => MapReportProtobuf.fromBinary((packet.payloadVariant.value as Data).payload, { readUnknownFields: true }))

    try {
      return AppDataSource.manager.merge(MapReport, new MapReport(), {
        nodeId: packet.from,
        longName: mr.longName,
        shortName: mr.shortName,
        role: mr.role,
        hardwareModel: mr.hwModel,
        firmwareVersion: mr.firmwareVersion,
        region: mr.region,
        modemPreset: mr.modemPreset,
        hasDefaultChannel: mr.hasDefaultChannel,
        latitude: mr.latitudeI,
        longitude: mr.longitudeI,
        altitude: mr.altitude,
        positionPrecision: mr.positionPrecision,
        numOnlineLocalNodes: mr.numOnlineLocalNodes,
      })
    } catch (e) {
      errLog(`unable to create map report`, { err: e, mr, envelope })
    }
  }
}
