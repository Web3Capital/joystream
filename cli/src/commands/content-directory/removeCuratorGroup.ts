import ContentDirectoryCommandBase from '../../base/ContentDirectoryCommandBase'
import chalk from 'chalk'

export default class AddCuratorGroupCommand extends ContentDirectoryCommandBase {
  static description = 'Remove existing Curator Group.'
  static args = [
    {
      name: 'id',
      required: false,
      description: 'ID of the Curator Group to remove',
    },
  ]

  async run() {
    const account = await this.getRequiredSelectedAccount()
    await this.requireLead()

    let { id } = this.parse(AddCuratorGroupCommand).args
    if (id === undefined) {
      id = await this.promptForCuratorGroup('Select Curator Group to remove')
    } else {
      await this.getCuratorGroup(id)
    }

    await this.requestAccountDecoding(account)
    await this.sendAndFollowNamedTx(account, 'contentDirectory', 'removeCuratorGroup', [id])

    console.log(chalk.green(`Curator Group ${chalk.white(id)} succesfully removed!`))
  }
}