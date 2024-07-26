import _ from 'lodash'
import { DateTime } from 'luxon'
import { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { HardwareModelIDToName, NodeRoleIDToName } from '../hardware-modules'
import { imageForModel } from '../image-for-model'
import { MessageIn, MessageOut } from '../interfaces'
import { Node } from '../nodes-entity'
import { Tooltip } from '../tooltip'
import { googleMapsLink, nodeUrl, timeAgo } from '../ui-util'

function mqttStatus(node: Node) {
  if (node.mqttConnectionState === 'online') {
    return (
      <>
        <span className="text-green-600">Online</span> {timeAgo(node.mqttConnectionStateUpdatedAt, true)}
      </>
    )
  } else {
    return (
      <>
        <span className="text-purple-600">Offline</span> {timeAgo(node.mqttConnectionStateUpdatedAt, true)}
      </>
    )
  }
}

const location = (node: Node) => {
  if (!node.latLng) {
    return
  }

  return (
    <li key="location">
      <span className="font-extrabold me-2">Location:</span>
      <a target="_blank" href={googleMapsLink(node.latLng)} rel="noreferrer">
        {node.latLng.join(', ')}
      </a>{' '}
      {timeAgo(node.positionUpdatedAt, true)}
    </li>
  )
}

type Value = string | number | ReactNode | ReactNode[]

type KeyValueType<T> = {
  key: string
  precision?: number
  unit?: string
} & ({ renderer: () => Value } | { value: T })

const keyValue = function <T>(args: KeyValueType<T>) {
  if ('renderer' in args) {
    const value = args.renderer()
    if (value === null || value === undefined) {
      return
    }
    return (
      <li key={args.key}>
        <span className="font-extrabold me-2">{args.key}:</span>
        {value}
      </li>
    )
  }

  if ('value' in args) {
    if (args.value === undefined || args.value === null) {
      return
    }

    if (typeof args.value === 'string') {
      return (
        <li key={args.key}>
          <span className="font-extrabold me-2">{args.key}:</span>
          {args.value}
        </li>
      )
    } else if (typeof args.value === 'number') {
      if (Number.isInteger(args.value)) {
        return (
          <li key={args.key}>
            <span className="font-extrabold me-2">{args.key}:</span>
            {args.value}
            {args.unit}
          </li>
        )
      } else {
        return (
          <li key={args.key}>
            <span className="font-extrabold me-2">{args.key}:</span>
            {Number(args.value).toFixed(args.precision)}
            {args.unit}
          </li>
        )
      }
    }
  }
}

const MINUS_ONE_HEX = Number('0xffffffff')
function renderMessage(message: MessageIn | MessageOut) {
  return (
    <li className="message-bubble" key={message.time}>
      <span className="text-sm">{message.text}</span> {timeAgo(message.time, true)}
    </li>
  )
}

function lastMessages(node: Node) {
  if (!node.outbox || node.outbox.length === 0) {
    return
  }

  const top5RecentMessages = node.outbox
    .filter((msg) => ('from' in msg && msg.from === MINUS_ONE_HEX) || ('to' in msg && msg.to === MINUS_ONE_HEX))
    .sort((a, b) => DateTime.fromISO(a.time).diff(DateTime.fromISO(b.time)).toMillis())
    .reverse()
    .slice(0, 5)

  if (top5RecentMessages.length === 0) {
    return
  }

  return (
    <li className="text-wrap" key="lastMessages">
      <span className="font-extrabold me-2">Recent outgoing LongFast messages</span>
      <ul className="list-inside ml-1">{top5RecentMessages.map(renderMessage)}</ul>
    </li>
  )
}

export function nodeTooltip(node: Node) {
  const image = imageForModel(node.hardwareModel) ? <img className="mb-4 w-40 mx-auto" src={imageForModel(node.hardwareModel)} /> : null
  const role = node.role ? NodeRoleIDToName[node.role] : null
  const hardwareModel =
    node.hardwareModel === undefined || node.hardwareModel === null ? undefined : HardwareModelIDToName[node.hardwareModel]

  const padding = () => <li key={window.crypto.randomUUID()} className="mt-3"></li>

  const nodeName = (
    <li key="longName">
      <span className="font-extrabold me-2">Long Name:</span><span className="font-extrabold">{node.longName || `(UNKNOWN)`}</span>
    </li>
  )

  const nodeRole = (
    <li key="nodeRole">
      <span className="font-extrabold me-2">Role:</span> {role}
    </li>
  )

  const showDetailsButton = (
    <p className="text-center mt-3" key="showDetails">
      <a className="button block w-full px-4 py-2 font-semibold border border-gray-400 shadow-lg shadow-gray-100 rounded bg-gray-100">
        Show details
      </a>
    </p>
  )

  const showMessagesButton = (
    <p className="text-center mt-3" key="showMessages" data-id="showMessagesButton">
      <a
        href={`/messages.html?from=${node.nodeId}`}
        target="_blank"
        rel="noreferrer"
        className="button block w-full px-4 py-2 font-semibold border border-gray-400 shadow-lg shadow-gray-100 rounded bg-gray-100"
      >
        Show Messages
      </a>
    </p>
  )

  const elements = [
    nodeName,
    keyValue({ key: 'Short Name', value: node.shortName }),
    keyValue({ key: 'MQTT Status', renderer: () => mqttStatus(node) }),
    nodeRole,
    padding(),
    location(node),
    keyValue({ key: 'Altitude', value: node.altitude, unit: 'm' }),
    padding(),
    lastMessages(node),
    padding(),
    keyValue({ key: 'Hardware', value: hardwareModel }),
    keyValue({ key: 'Firmware', value: node.firmwareVersion }),
    keyValue({ key: 'Voltage', value: node.voltage, precision: 2, unit: 'V' }),
    keyValue({
      key: 'Battery',
      renderer: () => {
        if (node.batteryLevel === null || node.batteryLevel === undefined) {
          return
        }

        if (node.batteryLevel > 100) {
          return 'Plugged In'
        } else {
          return `${node.batteryLevel}%`
        }
      },
    }),
    padding(),
    keyValue({ key: 'Ch Util', value: node.channelUtilization, unit: '%', precision: 2 }),
    keyValue({ key: 'Air Util', value: node.airUtilTx, unit: '%', precision: 2 }),
    padding(),
    keyValue({
      key: 'ID',
      renderer: () => {
        const link = nodeUrl(node)
        return (
          <>
            <a href={link}>
              {node.nodeId} (!{node.nodeId.toString(16)})
            </a>
            <Tooltip tooltipText="Copy link to clipboard" className="button border-sm inline-block rounded border ml-3">
              <svg
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="w-8 h-8 inline-block"
                data-copy={link}
              >
                <path d="M13 10.75h-1.25a2 2 0 0 0-2 2v8.5a2 2 0 0 0 2 2h8.5a2 2 0 0 0 2-2v-8.5a2 2 0 0 0-2-2H19"></path>
                <path d="M18 12.25h-4a1 1 0 0 1-1-1v-1.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.5a1 1 0 0 1-1 1ZM13.75 16.25h4.5M13.75 19.25h4.5"></path>
              </svg>
            </Tooltip>
          </>
        )
      },
    }),
    keyValue({ key: 'Updated', value: node.updatedAt, renderer: timeAgo }),
    showDetailsButton,
    showMessagesButton,
  ]

  return renderToString(
    <div className="text-base tabular-nums max-w-sm hover:max-w-lg">
      {image}
      <ul>{_.compact(elements)}</ul>
    </div>
  )
}

function handleButtonClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.matches('[data-copy]')) {
    target.classList.add('motion-safe:animate-ping')
    const currentURL = new URL(target.getAttribute('data-copy')!, window.location.href)
    currentURL.hash = ''
    navigator.clipboard.writeText(currentURL.toString())
    setTimeout(() => target.classList.remove('motion-safe:animate-ping'), 500)
  }
}

document.addEventListener('click', handleButtonClick)
