import React from 'react';
import BN from 'bn.js';
import axios, { CancelTokenSource } from 'axios';
import { Progress, Message } from 'semantic-ui-react';

import { InputFile } from '@polkadot/ui-app/index';
import { ApiProps } from '@polkadot/ui-api/types';
import { I18nProps } from '@polkadot/ui-app/types';
import { SubmittableResult } from '@polkadot/api';
import { Option } from '@polkadot/types/codec';
import { withMulti } from '@polkadot/ui-api';
import { formatNumber } from '@polkadot/util';
import { AccountId } from '@polkadot/types';

import translate from './translate';
import { fileNameWoExt } from './utils';
import { ContentId, DataObject } from '@joystream/types/media';
import { MyAccountProps, withOnlyMembers } from '@polkadot/joy-utils/MyAccount';
import { DiscoveryProviderProps } from './DiscoveryProvider';
import EditMeta from './EditMeta';
import TxButton from '@polkadot/joy-utils/TxButton';
import IpfsHash from 'ipfs-only-hash';

const MAX_FILE_SIZE_MB = 100;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

type Props = ApiProps & I18nProps & MyAccountProps & DiscoveryProviderProps;

type State = {
  error?: any,
  file?: File,
  ipfs_cid?: string,
  newContentId: ContentId,
  discovering: boolean,
  uploading: boolean,
  progress: number,
  cancelSource: CancelTokenSource
};

const defaultState = (): State => ({
  error: undefined,
  file: undefined,
  newContentId: ContentId.generate(),
  discovering: false,
  uploading: false,
  progress: 0,
  cancelSource: axios.CancelToken.source()
});

class Component extends React.PureComponent<Props, State> {

  state = defaultState();

  componentWillUnmount () {
    this.setState({
      discovering: false,
      uploading: false,
    })

    const { cancelSource } = this.state;
    cancelSource.cancel('unmounting');
  }

  render () {
    return (
      <div className='UploadBox'>
        {this.renderContent()}
      </div>
    );
  }

  private renderContent () {
    const { error, uploading, discovering } = this.state;

    if (error) return this.renderError();
    else if (discovering) return this.renderDiscovering();
    else if (uploading) return this.renderUploading();
    else return this.renderFileInput();
  }

  private renderError () {
    const { error } = this.state;
    return (
      <Message error className='JoyMainStatus'>
        <Message.Header>Failed to upload your file</Message.Header>
        <p>{error.toString()}</p>
        <button className='ui button' onClick={this.resetForm}>Start over</button>
      </Message>
    );
  }

  private resetForm = () => {
    let newDefaultState = defaultState();
    const { cancelSource } = this.state;
    newDefaultState.cancelSource = cancelSource;
    this.setState(newDefaultState);
  }

  private renderUploading () {
    const { file, newContentId, progress, error } = this.state;
    if (!file) return <em>Loading...</em>;

    const success = !error && progress >= 100;

    return <div style={{ width: '100%' }}>
      {this.renderProgress()}
      {success && <EditMeta contentId={newContentId} fileName={fileNameWoExt(file.name)} />}
    </div>;
  }

  private renderDiscovering () {
    return <em>Contacting Storage Provider...</em>
  }

  private renderProgress () {
    const { progress, error } = this.state;
    const active = !error && progress < 100;
    const success = !error && progress >= 100;

    let label = '';
    if (active) {
      label = `Your file is uploading. Please keep this page open until it's done.`;
    } else if (success) {
      label = `Uploaded! Click "Publish" button to make your file live.`;
    }

    return <Progress
      className='UploadProgress'
      progress={success}
      percent={progress}
      active={active}
      success={success}
      label={label}
    />;
  }

  private renderFileInput () {
    const { file } = this.state;

    return <div className='UploadSelectForm'>
      <InputFile
        withLabel={false}
        className={`UploadInputFile ${file ? 'FileSelected' : ''}`}
        placeholder={
          <div>
            <div><i className='cloud upload icon'></i></div>
            <div>{file
              ? `${file.name} (${formatNumber(file.size)} bytes)`
              : <>
                <div>Drag and drop either video or audio file here.</div>
                <div>Your file should not be more than {MAX_FILE_SIZE_MB} MB.</div>
              </>
            }</div>
          </div>
        }
        onFileSelected={this.onFileSelected}
      />
      {file && <div className='UploadButtonBox'>
        <TxButton
          size='large'
          label={'Upload'}
          isDisabled={!file}
          tx={'dataDirectory.addContent'}
          params={this.buildTxParams()}
          txSuccessCb={this.onDataObjectCreated}
        />
      </div>}
    </div>;
  }

  private onFileSelected = async (data: Uint8Array, file: File) => {
    if (!data || data.length === 0) {
      this.setState({ error: `You cannot upload an empty file.` });
    } else if (data.length > MAX_FILE_SIZE_BYTES) {
      this.setState({ error:
        `You cannot upload a file that is more than ${MAX_FILE_SIZE_MB} MB.`
      });
    } else {
      const ipfs_cid = await IpfsHash.of(Buffer.from(data));
      console.log('computed IPFS hash:', ipfs_cid)
      // File size is valid and can be uploaded:
      this.setState({ file, ipfs_cid });
    }
  }

  private buildTxParams = () => {
    const { file, newContentId, ipfs_cid } = this.state;
    if (!file || !ipfs_cid) return [];

    // TODO get corresponding data type id based on file content
    const dataObjectTypeId = new BN(1);

    return [ newContentId, dataObjectTypeId, new BN(file.size), ipfs_cid];
  }

  private onDataObjectCreated = async (_txResult: SubmittableResult) => {
    this.setState({ discovering: true});

    const { api } = this.props;
    const { newContentId } = this.state;
    try {
      var dataObject = await api.query.dataDirectory.dataObjectByContentId(newContentId) as Option<DataObject>;
    } catch (err) {
      this.setState({
        error: err,
        discovering: false
      });
      return
    }

    const { discovering } = this.state;

    if (!discovering) {
      return
    }

    if (dataObject.isSome) {
      const storageProvider = dataObject.unwrap().liaison;
      this.uploadFileTo(storageProvider);
    } else {
      this.setState({
        error: new Error('No Storage Provider assigned to process upload'),
        discovering: false
      });
    }
  }

  private uploadFileTo = async (storageProvider: AccountId) => {
    const { file, newContentId, cancelSource } = this.state;
    if (!file) {
      this.setState({
        error: new Error('No file to upload!'),
        discovering: false,
      });
      return;
    }

    const contentId = newContentId.encode();
    const config = {
      headers: {
        // TODO uncomment this once the issue fixed:
        // https://github.com/Joystream/storage-node-joystream/issues/16
        // 'Content-Type': file.type
        'Content-Type': '' // <-- this is a temporary hack
      },
      cancelToken: cancelSource.token,
      onUploadProgress: (progressEvent: any) => {
        const percentCompleted = Math.round( (progressEvent.loaded * 100) / progressEvent.total );
        this.setState({
          progress: percentCompleted
        });
      }
    };

    const { discoveryProvider } = this.props;

    try {
      var url = await discoveryProvider.resolveAssetEndpoint(storageProvider, contentId, cancelSource.token);
    } catch (err) {
      return this.setState({
        error: new Error(`Failed to contact storage provider: ${err.message}`),
        discovering: false,
      });
    }

    const { discovering } = this.state;

    if (!discovering) {
      return
    }

    // TODO: validate url .. must start with http

    this.setState({ discovering: false, progress: 0, uploading: true });

    try {
      await axios.put<{ message: string }>(url, file, config);
    } catch(err) {
      this.setState({ progress: 0, error: err, uploading: false });
      if (axios.isCancel) {
        return
      }
      if (!err.response || (err.response.status >= 500 && err.response.status <= 504)) {
        // network connection error
        discoveryProvider.reportUnreachable(storageProvider);
      }
    }
  }
}

export default withMulti(
  Component,
  translate,
  withOnlyMembers,
);
