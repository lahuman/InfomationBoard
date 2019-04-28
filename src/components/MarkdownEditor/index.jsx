
import React from 'react'
import Remarkable from 'remarkable';
import { Row, Col, Input } from 'antd';


class MarkdownEditor extends React.Component {
  constructor(props) {
    super(props);
    this.handleChange = this.handleChange.bind(this);
    this.state = { value: 'Hello, **world**!' };
  }

  handleChange(e) {
    this.setState({ value: e.target.value });
  }

  getRawMarkup() {
    const md = new Remarkable('full', {
      html: true,
      linkify: true,
      typographer: true,
    });

    return { __html: md.render(this.state.value) };
  }

  render() {
    return (
      <Row justify="center" gutter={24}>
        <Col span={12}><Input.TextArea rows="20"
          id="markdown-content"
          onChange={this.handleChange}
          defaultValue={this.state.value}
        /></Col>
        <Col span={12} className="content"
          dangerouslySetInnerHTML={this.getRawMarkup()}></Col>
      </Row>
    );
  }
}


export default MarkdownEditor;