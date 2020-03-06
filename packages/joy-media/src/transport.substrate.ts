import BN from 'bn.js';
import { MediaTransport, ChannelValidationConstraints, ValidationConstraint } from './transport';
import { ClassId, Class, EntityId, Entity, ClassName } from '@joystream/types/versioned-store';
import { InputValidationLengthConstraint } from '@joystream/types/forum';
import { PlainEntity, EntityCodecResolver } from '@joystream/types/versioned-store/EntityCodec';
import { MusicTrackType } from './schemas/music/MusicTrack';
import { MusicAlbumType } from './schemas/music/MusicAlbum';
import { VideoType } from './schemas/video/Video';
import { ContentLicenseType } from './schemas/general/ContentLicense';
import { CurationStatusType } from './schemas/general/CurationStatus';
import { LanguageType } from './schemas/general/Language';
import { MediaObjectType } from './schemas/general/MediaObject';
import { MusicGenreType } from './schemas/music/MusicGenre';
import { MusicMoodType } from './schemas/music/MusicMood';
import { MusicThemeType } from './schemas/music/MusicTheme';
import { PublicationStatusType } from './schemas/general/PublicationStatus';
import { VideoCategoryType } from './schemas/video/VideoCategory';
import { ChannelEntity } from './entities/ChannelEntity';
import { ChannelId, Channel } from '@joystream/types/content-working-group';
import { ApiPromise } from '@polkadot/api/index';
import { ApiProps } from '@polkadot/react-api/types';
import { Vec } from '@polkadot/types';
import { LinkageResult } from '@polkadot/types/codec/Linkage';
import { ChannelCodec } from './schemas/channel/Channel';
import { FeaturedContentType } from './schemas/general/FeaturedContent';

const FIRST_CHANNEL_ID = 1;
const FIRST_CLASS_ID = 1;
const FIRST_ENTITY_ID = 1;

/**
 * There are entities that refer to other entities.
 * 
 */
const ClassNamesThatRequireLoadingInternals: ClassName[] = [
  'Video',
  'MusicTrack',
  'MusicAlbum'
]

/**
 * There are such group of entities that are safe to cache
 * becase they serve as utility entities. 
 * Very unlikely that their values will be changed frequently. 
 * Even if changed, this is not a big issue from UI point of view.
 */
const ClassNamesThatCanBeCached: ClassName[] = [
  'ContentLicense',
  'CurationStatus',
  'Language',
  'MusicGenre',
  'MusicMood',
  'MusicTheme',
  'PublicationStatus',
  'VideoCategory',
]

type AnyEntityId = EntityId | BN | number | string

function asEntityId(id: AnyEntityId): EntityId {
  if (id instanceof EntityId) {
    return id
  } else if (id instanceof BN || typeof id === 'number' || typeof id === 'string') {
    return new EntityId(id)
  } else {
    throw new Error(`Not supported format for entity id: ${id}`)
  }
}

export class SubstrateTransport extends MediaTransport {

  protected api: ApiPromise

  private entityCodecResolver: EntityCodecResolver | undefined

  private cachedClasses: Class[] | undefined

  private cachedInternalEntities: Entity[] | undefined

  private cachedEntityIdsAsStrings: Set<string> = new Set()

  constructor(api: ApiProps) {
    super();
    console.log('Create new SubstrateTransport')

    if (!api) {
      throw new Error('Cannot create SubstrateTransport: Substrate API is required');
    } else if (!api.isApiReady) {
      throw new Error('Cannot create SubstrateTransport: Substrate API is not ready yet');
    }

    this.api = api.api
  }

  protected notImplementedYet<T> (): T {
    throw new Error('Substrate transport: Requested function is not implemented yet')
  }

  /** Content Working Group query. */
  cwgQuery() {
    return this.api.query.contentWorkingGroup
  }

  /** Versioned Store query. */
  vsQuery() {
    return this.api.query.versionedStore
  }

  // Channels (Content Working Group module)
  // -----------------------------------------------------------------

  async nextChannelId(): Promise<ChannelId> {
    return await this.cwgQuery().nextChannelId<ChannelId>()
  }

  async allChannelIds(): Promise<ChannelId[]> {
    let nextId = (await this.nextChannelId()).toNumber()
    if (nextId < 1) nextId = 1

    const allIds: ChannelId[] = []
    for (let id = FIRST_CHANNEL_ID; id < nextId; id++) {
      allIds.push(new ChannelId(id))
    }

    return allIds
  }

  async allChannels(): Promise<ChannelEntity[]> {
    const ids = await this.allChannelIds()
    const channelTuples = await this.cwgQuery().channelById.multi<LinkageResult>(ids)

    return channelTuples.map((tuple, i) => {
      const channel = tuple[0] as Channel
      const plain = ChannelCodec.fromSubstrate(ids[i], channel)
      
      return {
        ...plain,
        rewardEarned: new BN(0), // TODO calc this value based on chain data
        contentItemsCount: 0,    // TODO calc this value based on chain data
      }
    })
  }

  protected async getValidationConstraint(constraintName: string): Promise<ValidationConstraint> {
    const constraint = await this.cwgQuery()[constraintName]<InputValidationLengthConstraint>()
    return {
      min: constraint.min.toNumber(),
      max: constraint.max.toNumber()
    }
  }

  async channelValidationConstraints(): Promise<ChannelValidationConstraints> {
    return {
      handle: await this.getValidationConstraint('channelHandleConstraint'),
      title: await this.getValidationConstraint('channelTitleConstraint'),
      description: await this.getValidationConstraint('channelDescriptionConstraint'),
      avatar: await this.getValidationConstraint('channelAvatarConstraint'),
      banner: await this.getValidationConstraint('channelBannerConstraint'),
    }
  }

  // Classes (Versioned Store module)
  // -----------------------------------------------------------------

  async nextClassId(): Promise<ClassId> {
    return await this.vsQuery().nextClassId<ClassId>()
  }

  async allClassIds(): Promise<ClassId[]> {
    let nextId = (await this.nextClassId()).toNumber()

    const allIds: ClassId[] = []
    for (let id = FIRST_CLASS_ID; id < nextId; id++) {
      allIds.push(new ClassId(id))
    }

    return allIds
  }

  async allClasses(): Promise<Class[]> {
    if (this.cachedClasses) return this.cachedClasses

    const ids = await this.allClassIds()
    this.cachedClasses = await this.vsQuery().classById.multi<Vec<Class>>(ids) as unknown as Class[]
    return this.cachedClasses
  }

  canCacheClass(className: ClassName): boolean {
    return ClassNamesThatCanBeCached.indexOf(className) >= 0
  }

  async getEntityCodecResolver(): Promise<EntityCodecResolver> {
    if (!this.entityCodecResolver) {
      const classes = await this.allClasses()
      this.entityCodecResolver = new EntityCodecResolver(classes)
    }
    return this.entityCodecResolver
  }

  // Entities (Versioned Store module)
  // -----------------------------------------------------------------

  async nextEntityId(): Promise<EntityId> {
    return await this.vsQuery().nextEntityId<EntityId>()
  }

  async allEntityIds(): Promise<EntityId[]> {
    let nextId = (await this.nextEntityId()).toNumber()

    const allIds: EntityId[] = []
    for (let id = FIRST_ENTITY_ID; id < nextId; id++) {
      allIds.push(new EntityId(id))
    }

    return allIds
  }

  private async loadEntitiesByIds(ids: AnyEntityId[]): Promise<Entity[]> {
    if (!ids || ids.length === 0) return []

    return await this.vsQuery().entityById.multi<Vec<Entity>>(ids) as unknown as Entity[]
  }

  private async loadAndCacheInternalEntities(allIds?: EntityId[]) {
    if (!allIds) {
      allIds = await this.allEntityIds()
    }

    const allEntities = await this.loadEntitiesByIds(allIds)
    const classIdByName = await this.classIdByNameMap()

    const classIdsThatCanBeCached = ClassNamesThatCanBeCached
      .map(name => classIdByName[name]?.toString())
      .filter(x => x !== undefined) as string[]

    // console.log({ classIdsThatCanBeCached })

    const canCacheEntity = (entity: Entity): boolean => {
      return classIdsThatCanBeCached.indexOf(entity.class_id.toString()) >= 0
    }

    this.cachedInternalEntities = allEntities.filter(canCacheEntity)

    this.cachedEntityIdsAsStrings = new Set(
      this.cachedInternalEntities.map(x => x.id.toString()))

    return this.cachedInternalEntities
  }

  async internalEntities(): Promise<Entity[]> {
    return this.cachedInternalEntities
      ? this.cachedInternalEntities
      : await this.loadAndCacheInternalEntities()
  }

  async allEntities(): Promise<Entity[]> {
    const allIds = await this.allEntityIds()

    if (!this.cachedInternalEntities) {
      await this.loadAndCacheInternalEntities(allIds)
    }
    
    const idsOfNoncachedEntities = allIds.filter(id =>
      !this.cachedEntityIdsAsStrings.has(id.toString()))

    const freshEntities = await this.loadEntitiesByIds(idsOfNoncachedEntities)

    console.log('Loaded fresh entities by ids:', idsOfNoncachedEntities)

    return this.cachedInternalEntities!.concat(freshEntities)
  }

  async allEntitiesByClassName(className: ClassName): Promise<Entity[]> {
    const classId = (await this.classIdByNameMap())[className]

    if (!classId) {
      console.log(`Cannot find a class id by its name '${className}'`)
      return []
    }

    const entities = this.canCacheClass(className)
      ? await this.internalEntities()
      : await this.allEntities()

    return entities.filter((e) => classId.eq(e.class_id))
  }

  private async findEntityInCache(id: AnyEntityId): Promise<Entity | undefined> {
    const entityId = asEntityId(id)
    return (await this.internalEntities()).find(x => entityId.eq(x.id))
  }

  private async loadEntityById(id: AnyEntityId): Promise<Entity | undefined> {
    const cachedEntity = await this.findEntityInCache(id)
    return cachedEntity ? cachedEntity : (await this.loadEntitiesByIds([ id ]))[0]
  }

  async findPlainEntitiesByClassName<T extends PlainEntity> (className: ClassName): Promise<T[]> {
    const res: T[] = []
    const clazz = await this.classByName(className)
    if (!clazz) {
      console.warn(`No class found by name '${className}'`)
      return res
    }

    const entityCodecResolver = await this.getEntityCodecResolver()
    const codec = entityCodecResolver.getCodecByClassId(clazz.id)
    if (!codec) {
      console.warn(`No entity codec found by class name '${className}'`)
      return res
    }

    const loadEntityById = this.loadEntityById.bind(this)
    const loadInternals = ClassNamesThatRequireLoadingInternals.indexOf(className) >= 0
    const codecProps = {
      entityCodecResolver,
      loadEntityById,
      loadInternals
    }

    const entities = await this.allEntitiesByClassName(className)
    for (const e of entities) {
      const converted = await codec.toPlainObject(e, codecProps)
      if (converted) {
        res.push(converted)
      }
    }

    return res
  }

  async featuredContent(): Promise<FeaturedContentType | undefined> {
    const arr = await this.findPlainEntitiesByClassName('FeaturedContent')
    return arr && arr.length ? arr[0] : undefined
  }

  async allMediaObjects(): Promise<MediaObjectType[]> {
    return await this.findPlainEntitiesByClassName('MediaObject')
  }

  async allVideos(): Promise<VideoType[]> {
    return await this.findPlainEntitiesByClassName('Video')
  }

  async allMusicTracks(): Promise<MusicTrackType[]> {
    return await this.findPlainEntitiesByClassName('MusicTrack')
  }

  async allMusicAlbums(): Promise<MusicAlbumType[]> {
    return await this.findPlainEntitiesByClassName('MusicAlbum')
  }

  async allContentLicenses (): Promise<ContentLicenseType[]> {
    return await this.findPlainEntitiesByClassName('ContentLicense')
  }

  async allCurationStatuses(): Promise<CurationStatusType[]> {
    return await this.findPlainEntitiesByClassName('CurationStatus')
  }

  async allLanguages(): Promise<LanguageType[]> {
    return await this.findPlainEntitiesByClassName('Language')
  }

  async allMusicGenres(): Promise<MusicGenreType[]> {
    return await this.findPlainEntitiesByClassName('MusicGenre')
  }

  async allMusicMoods(): Promise<MusicMoodType[]> {
    return await this.findPlainEntitiesByClassName('MusicMood')
  }

  async allMusicThemes(): Promise<MusicThemeType[]> {
    return await this.findPlainEntitiesByClassName('MusicTheme')
  }

  async allPublicationStatuses(): Promise<PublicationStatusType[]> {
    return await this.findPlainEntitiesByClassName('PublicationStatus')
  }

  async allVideoCategories(): Promise<VideoCategoryType[]> {
    return await this.findPlainEntitiesByClassName('VideoCategory')
  }
}
